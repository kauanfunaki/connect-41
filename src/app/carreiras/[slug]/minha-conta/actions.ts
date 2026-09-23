"use server";

// Ações da conta do candidato. Rota pública (o proxy libera /carreiras/): cada
// ação refaz a checagem da sessão pelo cookie e só mexe no que pertence às
// pessoas CANDIDATO com o e-mail da sessão — nunca num id que veio do
// formulário sem conferir de quem é.

import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { hit, clientIp } from "@/lib/rateLimit";
import { notifySector, notifyUser } from "@/lib/notifications";
import { sendLinkDoCandidatoEmail } from "@/lib/email/sendMail";
import { publicUrl } from "@/lib/jobPostingSchema";
import { MAX_BYTES_DO_CURRICULO, MAX_MB_DO_CURRICULO, ehPdf } from "@/lib/curriculo";
import {
  VALIDADE_DA_SESSAO_MS,
  cookieDaSessao,
  criarLink,
  emailDaSessao,
  encerrarSessao,
  temInscricao,
  trocarLinkPorSessao,
} from "@/lib/carreiras/conta";
import { emailValido, normalizarEmail, situacaoParaCandidato } from "@/lib/carreiras/situacaoDoCandidato";

export type RespostaDaConta = { erro: string } | { ok: true; mensagem?: string } | null;

const RESUMES_DIR = path.join(process.cwd(), "storage", "resumes");

async function escritorio(slug: string) {
  const t = await getPrisma().tenant.findUnique({ where: { slug }, select: { id: true, name: true, active: true } });
  return t && t.active ? t : null;
}

/** A sessão do candidato neste escritório, ou null. */
async function sessao(slug: string) {
  const tenant = await escritorio(slug);
  if (!tenant) return null;
  const raw = (await cookies()).get(cookieDaSessao(slug).nome)?.value;
  const email = await emailDaSessao(tenant.id, raw);
  if (!email) return null;
  const pessoas = await getPrisma().person.findMany({
    where: { tenantId: tenant.id, type: "CANDIDATO", email },
    select: { id: true, name: true },
  });
  if (pessoas.length === 0) return null;
  return { tenant, email, raw, pessoas, personIds: pessoas.map((p) => p.id) };
}

/**
 * Pede o link de acesso. A resposta é a mesma com ou sem inscrição — dizer "não
 * achamos este e-mail" deixaria qualquer um descobrir quem se candidatou.
 */
export async function pedirLink(slug: string, _prev: RespostaDaConta, form: FormData): Promise<RespostaDaConta> {
  const email = normalizarEmail(form.get("email") as string | null);
  if (!emailValido(email)) return { erro: "Informe um e-mail válido." };

  const ip = clientIp({ headers: await headers() });
  if (!hit(`candidato-link-ip:${ip}`, 5, 15 * 60_000).allowed || !hit(`candidato-link-email:${email}`, 3, 15 * 60_000).allowed) {
    return { erro: "Muitos pedidos em sequência. Tente de novo em alguns minutos." };
  }

  const tenant = await escritorio(slug);
  if (!tenant) return { erro: "Página não encontrada." };

  const mensagem = "Se houver inscrição com este e-mail, enviamos um link de acesso. Confira sua caixa de entrada (e o spam). O link vale por 30 minutos.";
  if (!(await temInscricao(tenant.id, email))) return { ok: true, mensagem };

  const raw = await criarLink(tenant.id, email);
  const url = publicUrl(`/carreiras/${slug}/minha-conta/entrar?t=${raw}`);
  if (!url) {
    console.error("[pedirLink] APP_PUBLIC_URL ausente — link não enviado");
    return { ok: true, mensagem };
  }
  const r = await sendLinkDoCandidatoEmail({ tenantId: tenant.id, to: email, nomeDoEscritorio: tenant.name, url });
  if (!r.ok) console.error("[pedirLink] e-mail não saiu:", r.error);
  return { ok: true, mensagem };
}

/** O clique na página de entrada: troca o link por uma sessão e abre a conta. */
export async function entrarComLink(slug: string, token: string): Promise<RespostaDaConta> {
  const tenant = await escritorio(slug);
  if (!tenant) return { erro: "Página não encontrada." };
  const raw = /^[0-9a-f]{64}$/.test(token) ? await trocarLinkPorSessao(tenant.id, token) : null;
  if (!raw) return { erro: "Este link expirou ou já foi usado. Peça um novo na página de acesso." };

  const c = cookieDaSessao(slug);
  (await cookies()).set(c.nome, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: c.caminho,
    maxAge: Math.floor(VALIDADE_DA_SESSAO_MS / 1000),
  });
  redirect(`/carreiras/${slug}/minha-conta`);
}

export async function sair(slug: string): Promise<void> {
  const tenant = await escritorio(slug);
  const c = cookieDaSessao(slug);
  const store = await cookies();
  if (tenant) await encerrarSessao(tenant.id, store.get(c.nome)?.value);
  store.set(c.nome, "", { path: c.caminho, maxAge: 0 });
  redirect(`/carreiras/${slug}/minha-conta`);
}

/** Avisa quem cuida da vaga: o responsável, senão o setor. */
async function avisarRecrutador(tenantId: string, vaga: { responsibleUserId: string | null; sectorCode: string }, personId: string, message: string) {
  const input = { tenantId, type: "CANDIDATE_UPDATE", message: message.slice(0, 255), entityType: "PERSON" as const, entityId: personId };
  if (vaga.responsibleUserId) await notifyUser(vaga.responsibleUserId, input);
  else await notifySector(vaga.sectorCode, input);
}

export async function desistir(slug: string, candidaturaId: string): Promise<RespostaDaConta> {
  const s = await sessao(slug);
  if (!s) return { erro: "Sua sessão expirou. Entre de novo." };
  const prisma = getPrisma();
  const c = await prisma.candidatura.findFirst({
    where: { id: candidaturaId, tenantId: s.tenant.id, personId: { in: s.personIds } },
    select: { id: true, status: true, stage: true, personId: true, vaga: { select: { title: true, responsibleUserId: true, sectorCode: true } } },
  });
  if (!c) return { erro: "Candidatura não encontrada." };
  if (!situacaoParaCandidato(c).podeDesistir) return { erro: "Esta candidatura não está mais em andamento." };

  // Condicional ao status: se o recrutador mudou algo no meio, não sobrescreve.
  const r = await prisma.candidatura.updateMany({ where: { id: c.id, status: "EM_ANDAMENTO" }, data: { status: "DESISTENTE" } });
  if (r.count !== 1) return { erro: "Esta candidatura não está mais em andamento." };

  const nome = s.pessoas.find((p) => p.id === c.personId)?.name ?? "O candidato";
  await avisarRecrutador(s.tenant.id, c.vaga, c.personId, `${nome} desistiu da vaga "${c.vaga.title}" pelo portal de vagas.`);
  revalidatePath(`/carreiras/${slug}/minha-conta`);
  return { ok: true };
}

/**
 * Telefone e currículo. O currículo novo vale para as candidaturas em
 * andamento: o perfil extraído do antigo é descartado e a marca de "sem
 * currículo" some, para a triagem automática ler o novo. Nota já dada não é
 * refeita sozinha — o recrutador decide se pontua de novo.
 */
export async function atualizarDados(slug: string, _prev: RespostaDaConta, form: FormData): Promise<RespostaDaConta> {
  const s = await sessao(slug);
  if (!s) return { erro: "Sua sessão expirou. Entre de novo." };
  const prisma = getPrisma();

  const telefone = ((form.get("phone") as string | null) ?? "").trim().slice(0, 30);
  const arquivo = form.get("resume");
  const temArquivo = arquivo instanceof File && arquivo.size > 0;
  if (!telefone && !temArquivo) return { erro: "Informe o telefone ou escolha um currículo." };

  let resumeUrl: string | null = null;
  if (temArquivo) {
    if (arquivo.size > MAX_BYTES_DO_CURRICULO) return { erro: `Currículo maior que ${MAX_MB_DO_CURRICULO} MB.` };
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    if (!ehPdf(bytes)) return { erro: "O currículo precisa ser um PDF." };
    const nome = `${randomUUID()}.pdf`;
    const dir = path.join(RESUMES_DIR, s.tenant.id);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, nome), bytes);
    resumeUrl = `${s.tenant.id}/${nome}`;
  }

  if (telefone) {
    await prisma.person.updateMany({ where: { id: { in: s.personIds } }, data: { phone: telefone } });
  }
  if (resumeUrl) {
    const emAndamento = await prisma.candidatura.findMany({
      where: { tenantId: s.tenant.id, personId: { in: s.personIds }, status: "EM_ANDAMENTO" },
      select: { id: true, personId: true, vaga: { select: { title: true, responsibleUserId: true, sectorCode: true } } },
    });
    await prisma.candidatura.updateMany({
      where: { id: { in: emAndamento.map((c) => c.id) } },
      data: { resumeUrl, perfilProfissional: Prisma.DbNull, perfilProfissionalEm: null, triagemFalha: null, triagemFalhaEm: null },
    });
    for (const c of emAndamento) {
      const nome = s.pessoas.find((p) => p.id === c.personId)?.name ?? "O candidato";
      await avisarRecrutador(s.tenant.id, c.vaga, c.personId, `${nome} enviou um currículo novo pelo portal (vaga "${c.vaga.title}").`);
    }
  }

  revalidatePath(`/carreiras/${slug}/minha-conta`);
  return { ok: true, mensagem: resumeUrl ? "Dados atualizados. O currículo novo vale para as candidaturas em andamento." : "Telefone atualizado." };
}

/** Pedido de exclusão (LGPD): registra e avisa o setor, que executa. */
export async function pedirExclusao(slug: string): Promise<RespostaDaConta> {
  const s = await sessao(slug);
  if (!s) return { erro: "Sua sessão expirou. Entre de novo." };
  const prisma = getPrisma();
  const agora = new Date();
  await prisma.person.updateMany({
    where: { id: { in: s.personIds }, dataDeletionRequestedAt: null },
    data: { dataDeletionRequestedAt: agora },
  });

  const ultima = await prisma.candidatura.findFirst({
    where: { tenantId: s.tenant.id, personId: { in: s.personIds } },
    orderBy: { createdAt: "desc" },
    select: { personId: true, vaga: { select: { responsibleUserId: true, sectorCode: true } } },
  });
  const personId = ultima?.personId ?? s.personIds[0]!;
  const nome = s.pessoas.find((p) => p.id === personId)?.name ?? "Um candidato";
  const setor = ultima?.vaga.sectorCode ?? "recrutamento";
  // Setor inteiro, e não só o responsável da vaga: é pedido legal, com prazo, e
  // não pode depender de uma pessoa estar olhando.
  await notifySector(setor, {
    tenantId: s.tenant.id,
    type: "CANDIDATE_DATA_DELETION",
    message: `${nome} pediu a exclusão dos dados pessoais (LGPD) pelo portal de vagas.`.slice(0, 255),
    entityType: "PERSON",
    entityId: personId,
  });

  revalidatePath(`/carreiras/${slug}/minha-conta`);
  return { ok: true, mensagem: "Pedido registrado. A equipe responsável vai tratar e pode entrar em contato." };
}
