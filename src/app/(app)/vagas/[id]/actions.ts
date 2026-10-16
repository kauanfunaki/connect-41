"use server";

import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PersonEmploymentStatus, PersonType, RecruitmentStage } from "@/generated/prisma/enums";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { podeAgirNaVaga } from "@/lib/recrutamento/acessoVagas";
import { limparOrigem } from "@/lib/recrutamento/origem";
import { MAX_BYTES_DO_CURRICULO, MAX_MB_DO_CURRICULO, ehPdf } from "@/lib/curriculo";
import { validatePersonForm } from "@/lib/validation/person";
import { pick } from "@/lib/forms";
import { formatInstantDate } from "@/lib/format";

/** Os currículos ficam fora de public/, como os do portal (/api/carreiras/apply). */
const PASTA_DOS_CURRICULOS = path.join(process.cwd(), "storage", "resumes");

// Promove o candidato a colaborador em admissão — mesma lógica usada quando o
// status vira CONTRATADO pelo controle de status ou pelo funil (soltar em
// "Contratado").
async function promoverParaColaborador(personId: string, companyId: string, cargoId: string | null) {
  const prisma = getPrisma();
  await prisma.person.update({
    where: { id: personId },
    data: {
      type: PersonType.COLABORADOR,
      employmentStatus: PersonEmploymentStatus.ADMISSAO_EM_ANDAMENTO,
      currentCompanyId: companyId,
      cargoId: cargoId ?? undefined,
    },
  });
}

// ─── Adicionar candidato (painel da ficha da vaga) ──────────────────────────
//
// Escolha "Vaga · 5 A" do Kauan (14/10/2026): o formulário "Nova candidatura"
// do pé do funil virou o botão "Adicionar candidato", que abre um painel com a
// busca no banco de talentos e o cadastro de quem é novo — sem sair da vaga.
// Até aqui, para quem não estava no banco, o recrutador ia a /candidatos/nova
// e voltava.

/** A vaga, se a pessoa pode adicionar candidatos a ela; senão, o erro para a tela. */
async function vagaParaAdicionar(vagaId: string): Promise<
  | { error: string }
  | { ctx: AuthContext; tenantId: string; vaga: { id: string; sectorCode: string; restrictedToRecruiters: boolean } }
> {
  const ctx = await getAuthContext();
  const tenantId = ctx.tenantId;
  if (!tenantId) return { error: "Não autenticado" };
  const vaga = await getPrisma().vaga.findFirst({
    where: { id: vagaId, ...scopedVagaWhere(ctx) },
    select: { id: true, sectorCode: true, restrictedToRecruiters: true },
  });
  if (!vaga) return { error: "Vaga não encontrada." };
  if (!(await podeAgirNaVaga(ctx, vaga))) return { error: "Sem permissão para adicionar candidatos nesta vaga." };
  return { ctx, tenantId, vaga };
}

export type CandidatoNaBusca = {
  id: string;
  nome: string;
  email: string | null;
  /** "no banco desde 03/10/2026". */
  desde: string;
  /** Já tem candidatura nesta vaga — aparece, mas não vincula de novo. */
  jaNaVaga: boolean;
};

const RESULTADOS_DA_BUSCA = 8;

/** A busca do painel: candidatos ativos do banco de talentos, por nome, e-mail ou CPF. */
export async function buscarNoBancoDeTalentos(vagaId: string, termo: string): Promise<{ error: string } | { candidatos: CandidatoNaBusca[] }> {
  const v = await vagaParaAdicionar(vagaId);
  if ("error" in v) return { error: v.error };
  const busca = String(termo ?? "").trim().slice(0, 120);
  if (busca.length < 2) return { candidatos: [] };
  const digitos = busca.replace(/\D/g, "");

  const pessoas = await getPrisma().person.findMany({
    where: {
      tenantId: v.tenantId,
      type: PersonType.CANDIDATO,
      active: true,
      OR: [
        { name: { contains: busca } },
        { email: { contains: busca } },
        { cpf: { contains: busca } },
        ...(digitos.length >= 3 && digitos !== busca ? [{ cpf: { contains: digitos } }] : []),
      ],
    },
    orderBy: { name: "asc" },
    take: RESULTADOS_DA_BUSCA,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      candidaturas: { where: { vagaId }, select: { id: true }, take: 1 },
    },
  });
  return {
    candidatos: pessoas.map((p) => ({
      id: p.id,
      nome: p.name,
      email: p.email,
      desde: `no banco desde ${formatInstantDate(p.createdAt, { day: "2-digit", month: "2-digit", year: "numeric" })}`,
      jaNaVaga: p.candidaturas.length > 0,
    })),
  };
}

export type ResultadoDoVinculo =
  | { ok: true; nome: string }
  /** `buscar`: o candidato já existe — a tela volta para a busca com este termo, onde ele aparece com "Vincular". */
  | { error: string; buscar?: string };

const JA_VINCULADO = "Este candidato já está vinculado a esta vaga.";

/** Vincula quem já está no banco de talentos. A origem é a escolhida no painel. */
export async function vincularCandidatoAVaga(vagaId: string, dados: { personId: string; origem?: string | null }): Promise<ResultadoDoVinculo> {
  const v = await vagaParaAdicionar(vagaId);
  if ("error" in v) return { error: v.error };
  const personId = typeof dados?.personId === "string" ? dados.personId : "";
  if (!personId) return { error: "Escolha o candidato." };

  const prisma = getPrisma();
  // A pessoa tem de ser candidato deste escritório: o id vem do navegador.
  const pessoa = await prisma.person.findFirst({
    where: { id: personId, tenantId: v.tenantId, type: PersonType.CANDIDATO },
    select: { id: true, name: true },
  });
  if (!pessoa) return { error: "Candidato não encontrado." };

  try {
    await prisma.candidatura.create({
      data: { tenantId: v.tenantId, vagaId, personId: pessoa.id, origin: limparOrigem(dados.origem) },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: JA_VINCULADO };
    console.error("[vincularCandidatoAVaga]", err);
    return { error: "Não foi possível vincular o candidato. Tente novamente." };
  }

  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath(`/candidatos/${pessoa.id}`);
  return { ok: true, nome: pessoa.name };
}

const TELEFONE = /^[\d\s()\-+]{8,20}$/;

/**
 * Cadastra o candidato e já o vincula à vaga. Os campos são os mínimos (nome,
 * e-mail, telefone e o currículo em PDF, opcional); o resto do cadastro fica
 * na ficha do candidato. Mesma permissão e mesma validação do "Novo
 * candidato" de /candidatos/nova (`criarCandidato`).
 *
 * Duplicata: e-mail que já é de um candidato do banco não cria outro — a tela
 * volta para a busca, onde ele aparece para vincular. É a mesma regra da
 * inscrição pelo portal, que reaproveita o candidato pelo e-mail.
 */
export async function cadastrarEVincularCandidato(vagaId: string, form: FormData): Promise<ResultadoDoVinculo> {
  const v = await vagaParaAdicionar(vagaId);
  if ("error" in v) return { error: v.error };
  if (!(await podeNoModulo(v.ctx, "recrutamento_candidatos", "gerir"))) return { error: "Sem permissão para cadastrar candidatos." };

  const erro = validatePersonForm(form);
  if (erro) return { error: erro };
  const nome = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = pick(form, "email")?.toLowerCase() ?? null;
  const telefone = pick(form, "phone");
  if (telefone && !TELEFONE.test(telefone)) return { error: "Telefone inválido." };
  const origin = limparOrigem(form.get("origem"));

  const prisma = getPrisma();
  if (email) {
    const existente = await prisma.person.findFirst({
      where: { tenantId: v.tenantId, type: PersonType.CANDIDATO, email },
      select: { name: true },
    });
    if (existente) {
      return { error: `Já existe um candidato com este e-mail: ${existente.name}. Ele está na busca — é só vincular.`, buscar: email };
    }
  }

  // O currículo é conferido antes de qualquer gravação: PDF de verdade (pelos
  // bytes, não pelo tipo declarado) e no limite do portal.
  const arquivo = form.get("curriculo");
  let curriculo: Buffer | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > MAX_BYTES_DO_CURRICULO) return { error: `Currículo maior que ${MAX_MB_DO_CURRICULO} MB.` };
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (!ehPdf(bytes)) return { error: "O currículo precisa ser um PDF." };
    curriculo = bytes;
  }

  // Grava o arquivo antes, no mesmo lugar dos currículos do portal (servidos só
  // por /api/resumes, com sessão); se o banco recusar, o arquivo sai.
  let resumeUrl: string | null = null;
  let caminhoDoArquivo: string | null = null;
  if (curriculo) {
    const pasta = path.join(PASTA_DOS_CURRICULOS, v.tenantId);
    const nomeDoArquivo = `${randomUUID()}.pdf`;
    await mkdir(pasta, { recursive: true });
    caminhoDoArquivo = path.join(pasta, nomeDoArquivo);
    await writeFile(caminhoDoArquivo, curriculo);
    resumeUrl = `${v.tenantId}/${nomeDoArquivo}`;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const pessoa = await tx.person.create({
        data: { tenantId: v.tenantId, type: PersonType.CANDIDATO, name: nome, email, phone: telefone },
        select: { id: true },
      });
      await tx.candidatura.create({ data: { tenantId: v.tenantId, vagaId, personId: pessoa.id, origin, resumeUrl } });
    });
  } catch (err) {
    if (caminhoDoArquivo) await unlink(caminhoDoArquivo).catch(() => {});
    console.error("[cadastrarEVincularCandidato]", err);
    return { error: "Não foi possível cadastrar o candidato. Tente novamente." };
  }

  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath("/candidatos");
  return { ok: true, nome };
}

// Move a candidatura entre etapas do funil (drag-and-drop). Soltar em
// CONTRATADO dispara a contratação (status + promoção), reaproveitando a mesma
// lógica do controle de status.
// Retorna erro em vez de void: o board aplica a mudança de forma otimista, e
// sem retorno ele não tinha como desfazer quando a ação falhava — o candidato
// aparecia na etapa nova mesmo com o banco intacto.
export async function moverEtapaCandidatura(
  vagaId: string,
  candidaturaId: string,
  stage: RecruitmentStage
): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!Object.values(RecruitmentStage).includes(stage)) return { error: "Etapa inválida." };

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId, vagaId },
    include: { vaga: true },
  });
  if (!candidatura) return { error: "Candidatura não encontrada ou fora do seu escopo." };
  if (!(await podeAgirNaVaga(ctx, candidatura.vaga))) {
    return { error: "Sem permissão para mover candidatos nesta vaga." };
  }

  try {
    if (stage === "CONTRATADO" && candidatura.status !== "CONTRATADO") {
      await prisma.candidatura.update({
        where: { id: candidaturaId },
        data: { stage, status: "CONTRATADO", hiredAt: new Date() },
      });
      await promoverParaColaborador(candidatura.personId, candidatura.vaga.companyId, candidatura.vaga.cargoId);
    } else {
      await prisma.candidatura.update({ where: { id: candidaturaId }, data: { stage } });
    }
  } catch (err) {
    console.error("[moverEtapaCandidatura]", err);
    return { error: "Não foi possível mover o candidato. Tente novamente." };
  }

  revalidatePath(`/vagas/${vagaId}`);
  revalidatePath(`/candidatos/${candidatura.personId}`);
  return null;
}

// Encerra a candidatura (reprovação/desistência). Mantém o `stage` atual de
// propósito — é o que preserva a medição de "quantos alcançaram cada etapa".
export async function encerrarCandidatura(
  vagaId: string,
  candidaturaId: string,
  outcome: "REPROVADO" | "DESISTENTE",
  reason: string | null
): Promise<{ error: string } | null> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (outcome !== "REPROVADO" && outcome !== "DESISTENTE") return { error: "Desfecho inválido." };

  const prisma = getPrisma();
  const candidatura = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: ctx.tenantId, vagaId },
    include: { vaga: { select: { id: true, sectorCode: true, restrictedToRecruiters: true } } },
  });
  if (!candidatura) return { error: "Candidatura não encontrada ou fora do seu escopo." };
  if (!(await podeAgirNaVaga(ctx, candidatura.vaga))) {
    return { error: "Sem permissão para encerrar candidaturas nesta vaga." };
  }

  const cleanReason = reason?.trim() || null;
  try {
    await prisma.candidatura.update({
      where: { id: candidaturaId },
      data: {
        status: outcome,
        rejectionReason: outcome === "REPROVADO" ? cleanReason : null,
        withdrawalReason: outcome === "DESISTENTE" ? cleanReason : null,
      },
    });
  } catch (err) {
    console.error("[encerrarCandidatura]", err);
    return { error: "Não foi possível encerrar a candidatura. Tente novamente." };
  }

  revalidatePath(`/vagas/${vagaId}`);
  return null;
}
