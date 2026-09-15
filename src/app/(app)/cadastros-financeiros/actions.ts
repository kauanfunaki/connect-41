"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { digitosDoDocumento } from "@/lib/financeiro/manual";

const MODULE = "bpo_cadastros";

export type ResultadoDoCadastro = { error: string } | { ok: true };

async function contexto(companyId: string) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  if (!canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode)) return { ok: false as const, erro: "Sem permissão." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!empresa) return { ok: false as const, erro: "Empresa não encontrada." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, prisma };
}

function documentoValido(doc: string | null): boolean {
  return doc === null || doc.length === 11 || doc.length === 14;
}

/** Categoria padrão só de despesa: a herança é regra de contas a pagar. */
async function categoriaDePagar(prisma: ReturnType<typeof getPrisma>, tenantId: string, id: string | null) {
  if (!id) return true;
  return !!(await prisma.financeCategory.findFirst({ where: { id, tenantId, kind: "PAGAR" }, select: { id: true } }));
}

export async function criarContraparte(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const companyId = texto("companyId");
  const c = await contexto(companyId);
  if (!c.ok) return { error: c.erro };

  const nome = texto("nome");
  const documento = digitosDoDocumento(texto("documento"));
  const categoriaId = texto("defaultCategoryId") || null;
  if (!nome) return { error: "Informe o nome." };
  if (nome.length > 180) return { error: "Nome com mais de 180 caracteres." };
  if (!documentoValido(documento)) return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  if (!(await categoriaDePagar(c.prisma, c.tenantId, categoriaId))) return { error: "Categoria não encontrada." };

  // Conferido antes, e não pego no unique: a mensagem do banco não diz qual
  // ficha já usa o documento, e é isso que a pessoa precisa saber.
  if (documento) {
    const existente = await c.prisma.financeCounterparty.findFirst({
      where: { tenantId: c.tenantId, companyId, document: documento },
      select: { name: true },
    });
    if (existente) return { error: `Este documento já é de "${existente.name}" nesta empresa.` };
  }

  const criada = await c.prisma.financeCounterparty.create({
    data: { tenantId: c.tenantId, companyId, name: nome, document: documento, defaultCategoryId: categoriaId },
    select: { id: true },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.counterparty.created",
    entityType: "FinanceCounterparty",
    entityId: criada.id,
    metadata: { companyId },
  });
  revalidatePath("/cadastros-financeiros");
  return { ok: true };
}

/**
 * Edita nome, categoria padrão e situação.
 *
 * O documento só pode ser **preenchido**, nunca trocado: é por ele que a nota
 * fiscal casa com a ficha. Trocar o CNPJ de uma ficha com histórico faria as
 * próximas notas do fornecedor antigo criarem outra ficha, e as antigas ficarem
 * penduradas num CNPJ que não é o delas.
 */
export async function atualizarContraparte(formData: FormData): Promise<ResultadoDoCadastro> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const id = texto("id");
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado." };
  const prisma = getPrisma();
  const atual = await prisma.financeCounterparty.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, companyId: true, document: true },
  });
  if (!atual) return { error: "Cadastro não encontrado." };

  const c = await contexto(atual.companyId);
  if (!c.ok) return { error: c.erro };

  const nome = texto("nome");
  const categoriaId = texto("defaultCategoryId") || null;
  const ativo = texto("ativo") === "1";
  const novoDocumento = atual.document ? null : digitosDoDocumento(texto("documento"));
  if (!nome || nome.length > 180) return { error: "Nome obrigatório, até 180 caracteres." };
  if (!documentoValido(novoDocumento)) return { error: "Documento não é CPF (11 dígitos) nem CNPJ (14)." };
  if (!(await categoriaDePagar(prisma, c.tenantId, categoriaId))) return { error: "Categoria não encontrada." };
  if (novoDocumento) {
    const dono = await prisma.financeCounterparty.findFirst({
      where: { tenantId: c.tenantId, companyId: atual.companyId, document: novoDocumento, NOT: { id } },
      select: { name: true },
    });
    if (dono) return { error: `Este documento já é de "${dono.name}" nesta empresa.` };
  }

  await prisma.financeCounterparty.update({
    where: { id },
    data: { name: nome, defaultCategoryId: categoriaId, active: ativo, ...(novoDocumento ? { document: novoDocumento } : {}) },
  });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.counterparty.updated",
    entityType: "FinanceCounterparty",
    entityId: id,
    metadata: { ativo, documentoPreenchido: !!novoDocumento },
  });
  revalidatePath("/cadastros-financeiros");
  return { ok: true };
}
