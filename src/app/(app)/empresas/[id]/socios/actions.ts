"use server";

// O cadastro de sócios de uma empresa cliente.
//
// Mesma forma dos outros cadastros da ficha da empresa (departamentos, cargos,
// turnos): escopo da empresa conferido antes de qualquer escrita, e o erro
// volta para a tela em vez de derrubar o formulário.
//
// O que é diferente aqui: **o documento é validado**. Um CPF com dígito errado
// no cadastro de sócio é pior que um campo vazio, porque ninguém desconfia dele
// — e é ele que amanhã vai casar o sócio com uma pessoa do sistema.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { lerDataDoCampo } from "@/lib/societario/datas";
import { lerQsa, planejarImportacao, type SocioDaReceita } from "@/lib/societario/qsa";
import { logAudit } from "@/lib/audit";

export type SocioState = { error: string } | null;

async function empresaNoEscopo(companyId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true },
  });
  return !!company;
}

type Campos = {
  name: string;
  document: string | null;
  administrator: boolean;
  sharePercent: number | null;
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
  qualification: string | null;
  quotas: number | null;
  capitalAmount: number | null;
  entryDate: Date | null;
  exitDate: Date | null;
};

function texto(form: FormData, campo: string): string | null {
  const v = (form.get(campo) as string | null)?.trim();
  return v ? v : null;
}

/** Lê e valida o formulário. Devolve a mensagem quando algo não serve. */
function lerCampos(form: FormData): { ok: true; campos: Campos } | { ok: false; erro: string } {
  const name = texto(form, "name");
  if (!name) return { ok: false, erro: "Nome do sócio é obrigatório." };

  // Documento é opcional — contrato social nem sempre está à mão na hora do
  // cadastro —, mas o que for digitado precisa ser um CPF ou CNPJ de verdade.
  let document: string | null = null;
  const documentoBruto = texto(form, "document");
  if (documentoBruto) {
    const doc = lerDocumentoFiscal(documentoBruto);
    if (!doc) return { ok: false, erro: "Documento inválido: informe um CPF ou CNPJ válido, ou deixe em branco." };
    document = doc.digitos;
  }

  let sharePercent: number | null = null;
  const percentBruto = texto(form, "sharePercent");
  if (percentBruto) {
    const n = Number(percentBruto.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, erro: "Participação deve ser um número entre 0 e 100." };
    }
    sharePercent = n;
  }

  let quotas: number | null = null;
  const quotasBruto = texto(form, "quotas");
  if (quotasBruto) {
    const n = Number(quotasBruto.replace(/\./g, ""));
    if (!Number.isInteger(n) || n < 0) return { ok: false, erro: "Quotas deve ser um número inteiro." };
    quotas = n;
  }

  let capitalAmount: number | null = null;
  const capitalBruto = texto(form, "capitalAmount");
  if (capitalBruto) {
    const n = Number(capitalBruto.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return { ok: false, erro: "Capital deve ser um valor em reais." };
    capitalAmount = Math.round(n * 100) / 100;
  }

  const entrada = lerDataDoCampo(form.get("entryDate"));
  const saida = lerDataDoCampo(form.get("exitDate"));
  if (!entrada.ok || !saida.ok) return { ok: false, erro: "Data inválida." };
  if (entrada.data && saida.data && saida.data < entrada.data) {
    return { ok: false, erro: "A saída não pode ser antes da entrada." };
  }

  const stateCode = texto(form, "stateCode")?.toUpperCase() ?? null;
  if (stateCode && stateCode.length !== 2) return { ok: false, erro: "UF deve ter duas letras." };

  return {
    ok: true,
    campos: {
      name,
      document,
      administrator: form.get("administrator") === "on",
      sharePercent,
      zipCode: texto(form, "zipCode"),
      addressStreet: texto(form, "addressStreet"),
      addressNumber: texto(form, "addressNumber"),
      addressComplement: texto(form, "addressComplement"),
      neighborhood: texto(form, "neighborhood"),
      city: texto(form, "city"),
      stateCode,
      qualification: texto(form, "qualification")?.slice(0, 80) ?? null,
      quotas,
      capitalAmount,
      entryDate: entrada.data,
      exitDate: saida.data,
    },
  };
}

const DUPLICADO = "Já existe um sócio com este documento nesta empresa.";

export async function criarSocio(_prev: SocioState, form: FormData): Promise<SocioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para cadastrar sócios." };

  const companyId = form.get("companyId") as string;
  if (!companyId || !(await empresaNoEscopo(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const lido = lerCampos(form);
  if (!lido.ok) return { error: lido.erro };

  try {
    await getPrisma().companyPartner.create({
      data: { tenantId: ctx.tenantId, companyId, ...lido.campos },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: DUPLICADO };
    console.error("[criarSocio]", err);
    return { error: "Erro ao cadastrar o sócio. Tente novamente." };
  }

  revalidatePath(`/empresas/${companyId}/socios`);
  redirect(`/empresas/${companyId}/socios`);
}

export async function atualizarSocio(_prev: SocioState, form: FormData): Promise<SocioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar sócios." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await empresaNoEscopo(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }

  const lido = lerCampos(form);
  if (!lido.ok) return { error: lido.erro };

  const prisma = getPrisma();
  const existente = await prisma.companyPartner.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existente) return { error: "Sócio não encontrado." };

  try {
    await prisma.companyPartner.update({ where: { id }, data: lido.campos });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: DUPLICADO };
    console.error("[atualizarSocio]", err);
    return { error: "Erro ao atualizar o sócio." };
  }

  revalidatePath(`/empresas/${companyId}/socios`);
  redirect(`/empresas/${companyId}/socios`);
}

export async function excluirSocio(id: string, companyId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;
  if (!(await empresaNoEscopo(companyId, ctx))) return;

  const prisma = getPrisma();
  // Apagar, e não inativar: nada no sistema aponta para o sócio, e o contrato
  // social vigente é o que a ficha deve refletir. Sócio que saiu não é
  // histórico a preservar aqui — é linha que deixou de ser verdade.
  const existente = await prisma.companyPartner.findFirst({ where: { id, tenantId: ctx.tenantId, companyId } });
  if (!existente) return;

  try {
    await prisma.companyPartner.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirSocio]", err);
    return;
  }

  revalidatePath(`/empresas/${companyId}/socios`);
}

/**
 * Registra a saída do sócio, com a data do distrato ou da alteração. Sócio que
 * saiu fica no cadastro, como ex-sócio: é histórico da empresa. Excluir
 * continua existindo para o que foi cadastrado por engano.
 */
export async function registrarSaida(_prev: SocioState, form: FormData): Promise<SocioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para editar sócios." };

  const id = form.get("id") as string;
  const companyId = form.get("companyId") as string;
  if (!companyId || !(await empresaNoEscopo(companyId, ctx))) {
    return { error: "Empresa não encontrada ou fora do seu escopo." };
  }
  const data = lerDataDoCampo(form.get("exitDate"));
  if (!data.ok || !data.data) return { error: "Informe a data de saída." };

  const prisma = getPrisma();
  const socio = await prisma.companyPartner.findFirst({
    where: { id, tenantId: ctx.tenantId, companyId },
    select: { id: true, name: true, entryDate: true, exitDate: true },
  });
  if (!socio) return { error: "Sócio não encontrado." };
  if (socio.exitDate) return { error: "Este sócio já tem saída registrada." };
  if (socio.entryDate && data.data < socio.entryDate) return { error: "A saída não pode ser antes da entrada." };

  await prisma.companyPartner.update({ where: { id }, data: { exitDate: data.data } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "empresa.socio.saida",
    entityType: "CompanyPartner",
    entityId: id,
    metadata: { companyId, nome: socio.name, saida: data.data.toISOString().slice(0, 10) },
  });
  revalidatePath(`/empresas/${companyId}/socios`);
  return null;
}

// ─── Importar da Receita ─────────────────────────────────────────────────────

export type LinhaDaPrevia = { nome: string; qualificacao: string | null; entrada: string | null; documento: string | null };

export type PreviaDaReceita =
  | { ok: false; erro: string }
  | {
      ok: true;
      novos: LinhaDaPrevia[];
      jaCadastrados: LinhaDaPrevia[];
      foraDaReceita: { id: string; nome: string }[];
    };

const paraLinha = (s: SocioDaReceita): LinhaDaPrevia => ({
  nome: s.nome,
  qualificacao: s.qualificacao,
  entrada: s.entrada ? s.entrada.toISOString().slice(0, 10) : null,
  documento: s.documento ?? s.documentoMascarado,
});

/** O quadro da Receita para a empresa, e o que já está cadastrado. */
async function lerDaReceita(companyId: string, tenantId: string) {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { cnpj: true } });
  const cnpj = (empresa?.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) return { ok: false as const, erro: "A empresa não tem CNPJ cadastrado." };

  let corpo: unknown;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      cache: "no-store",
      // Sem User-Agent a BrasilAPI responde 403 para o fetch do Node (visto em
      // 25/09); pelo navegador passa porque o navegador manda o dele.
      headers: { "User-Agent": "Connect41/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { ok: false as const, erro: "A Receita não encontrou este CNPJ." };
    if (!res.ok) {
      return { ok: false as const, erro: `A consulta à Receita falhou (HTTP ${res.status}). Tente de novo em alguns minutos.` };
    }
    corpo = await res.json();
  } catch {
    return { ok: false as const, erro: "A consulta à Receita não respondeu. Tente de novo em alguns minutos." };
  }

  const daReceita = lerQsa(corpo);
  const cadastrados = await prisma.companyPartner.findMany({
    where: { tenantId, companyId },
    select: { id: true, name: true, document: true, documentMasked: true, exitDate: true, qualification: true, entryDate: true },
  });
  return { ok: true as const, daReceita, cadastrados, plano: planejarImportacao(cadastrados, daReceita) };
}

export async function previaDaReceita(companyId: string): Promise<PreviaDaReceita> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return { ok: false, erro: "Sem permissão para editar sócios." };
  if (!(await empresaNoEscopo(companyId, ctx))) return { ok: false, erro: "Empresa não encontrada ou fora do seu escopo." };

  const r = await lerDaReceita(companyId, ctx.tenantId);
  if (!r.ok) return r;
  if (r.daReceita.length === 0) {
    return { ok: false, erro: "A Receita não informa sócios para este CNPJ (empresário individual ou MEI, por exemplo)." };
  }
  return {
    ok: true,
    novos: r.plano.novos.map(paraLinha),
    jaCadastrados: r.plano.jaCadastrados.map((j) => paraLinha(j.daReceita)),
    foraDaReceita: r.plano.foraDaReceita.map((f) => ({ id: f.id, nome: f.name })),
  };
}

/**
 * Grava o que a prévia mostrou. Relê a Receita em vez de confiar no que a tela
 * mandou: a prévia pode ter ficado aberta, e a action é alcançável por POST.
 * Sócio que está no Connect e saiu da Receita **não** ganha saída sozinho — a
 * data é do distrato, e só quem tem o documento sabe qual é.
 */
export async function importarDaReceita(companyId: string): Promise<SocioState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return { error: "Sem permissão para editar sócios." };
  if (!(await empresaNoEscopo(companyId, ctx))) return { error: "Empresa não encontrada ou fora do seu escopo." };
  const tenantId = ctx.tenantId;

  const r = await lerDaReceita(companyId, tenantId);
  if (!r.ok) return { error: r.erro };

  const prisma = getPrisma();
  const porId = new Map(r.cadastrados.map((c) => [c.id, c]));
  try {
    await prisma.$transaction(async (tx) => {
      for (const n of r.plano.novos) {
        await tx.companyPartner.create({
          data: {
            tenantId,
            companyId,
            name: n.nome,
            document: n.documento,
            documentMasked: n.documentoMascarado,
            qualification: n.qualificacao,
            administrator: n.administrador,
            entryDate: n.entrada,
            origin: "RECEITA",
          },
        });
      }
      // O que já estava: completa o vazio, não troca o que alguém digitou.
      for (const j of r.plano.jaCadastrados) {
        const atual = porId.get(j.id)!;
        const dados = {
          ...(!atual.qualification && j.daReceita.qualificacao ? { qualification: j.daReceita.qualificacao } : {}),
          ...(!atual.entryDate && j.daReceita.entrada ? { entryDate: j.daReceita.entrada } : {}),
          ...(!atual.document && !atual.documentMasked && j.daReceita.documentoMascarado
            ? { documentMasked: j.daReceita.documentoMascarado }
            : {}),
        };
        if (Object.keys(dados).length) await tx.companyPartner.update({ where: { id: j.id }, data: dados });
      }
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: DUPLICADO };
    console.error("[importarDaReceita]", err);
    return { error: "Erro ao importar os sócios. Tente novamente." };
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "empresa.socio.importado_da_receita",
    entityType: "Company",
    entityId: companyId,
    metadata: { novos: r.plano.novos.length, completados: r.plano.jaCadastrados.length },
  });
  revalidatePath(`/empresas/${companyId}/socios`);
  return null;
}
