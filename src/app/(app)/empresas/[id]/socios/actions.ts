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
