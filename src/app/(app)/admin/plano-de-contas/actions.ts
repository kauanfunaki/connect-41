"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { logAudit } from "@/lib/audit";
import type { FinanceEntryKind } from "@/generated/prisma/enums";
import { ondeDoPadrao } from "@/lib/financeiro/planoDeContas";
import { planejarCarga } from "@/lib/financeiro/carregarPlanoPadrao";
import { PLANO_PADRAO_41 } from "@/lib/financeiro/planoPadrao";

export type PlanoDeContasState = { error: string } | null;

const KINDS = ["PAGAR", "RECEBER"] as const;

function lerKind(form: FormData): FinanceEntryKind | null {
  const v = String(form.get("kind") ?? "");
  return (KINDS as readonly string[]).includes(v) ? (v as FinanceEntryKind) : null;
}

export async function criarCategoria(
  _prev: PlanoDeContasState,
  form: FormData
): Promise<PlanoDeContasState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar o plano de contas." };

  const name = String(form.get("name") ?? "").trim();
  const kind = lerKind(form);
  const dreGroup = String(form.get("dreGroup") ?? "").trim();

  if (!name) return { error: "Nome da categoria é obrigatório." };
  if (!kind) return { error: "Escolha se a categoria é de contas a pagar ou a receber." };

  const prisma = getPrisma();
  try {
    await prisma.financeCategory.create({
      data: { tenantId: ctx.tenantId, name, kind, dreGroup: dreGroup || null },
    });
  } catch (err) {
    // A unicidade é (tenant, nome, kind): o mesmo nome pode existir dos dois
    // lados — "Fretes" é despesa para quem contrata e receita para quem presta.
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe uma categoria "${name}" em contas a ${kind === "PAGAR" ? "pagar" : "receber"}.` };
    }
    console.error("[criarCategoria]", err);
    return { error: "Erro ao criar categoria. Tente novamente." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeCategory.create",
    entityType: "FinanceCategory",
    metadata: { name, kind, dreGroup: dreGroup || null },
  });

  revalidatePath("/admin/plano-de-contas");
  redirect("/admin/plano-de-contas");
}

export async function atualizarCategoria(
  _prev: PlanoDeContasState,
  form: FormData
): Promise<PlanoDeContasState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar o plano de contas." };

  const id = String(form.get("id") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const dreGroup = String(form.get("dreGroup") ?? "").trim();

  if (!name) return { error: "Nome da categoria é obrigatório." };

  const prisma = getPrisma();
  const existente = await prisma.financeCategory.findFirst({
    // Só o padrão do escritório: categoria de empresa se edita no plano dela.
    where: { id, ...ondeDoPadrao(ctx.tenantId) },
  });
  if (!existente) return { error: "Categoria não encontrada." };

  try {
    // `kind` não é editável: virar uma categoria de pagar em receber mudaria o
    // sinal de todo lançamento já classificado nela, sem que ninguém revisse.
    await prisma.financeCategory.update({
      where: { id },
      data: { name, dreGroup: dreGroup || null },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) {
      return { error: `Já existe uma categoria "${name}" desse lado do plano.` };
    }
    console.error("[atualizarCategoria]", err);
    return { error: "Erro ao atualizar categoria." };
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeCategory.update",
    entityType: "FinanceCategory",
    entityId: id,
    metadata: { name, dreGroup: dreGroup || null },
  });

  revalidatePath("/admin/plano-de-contas");
  redirect("/admin/plano-de-contas");
}

/**
 * Liga/desliga a categoria — **não existe exclusão aqui, de propósito.**
 *
 * A FK de `finance_entries.categoryId` é `ON DELETE SET NULL`: apagar uma
 * categoria desclassificaria em silêncio todo lançamento que já a usava, e
 * despesa sem classificação não fecha o DRE. O campo `active` existe no modelo
 * exatamente para isso — a categoria desativada some do dropdown de novos
 * lançamentos e continua explicando os antigos.
 */
export async function alternarCategoria(id: string, ativa: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existente = await prisma.financeCategory.findFirst({
    // Só o padrão do escritório: categoria de empresa se edita no plano dela.
    where: { id, ...ondeDoPadrao(ctx.tenantId) },
    select: { id: true, name: true },
  });
  if (!existente) return;

  await prisma.financeCategory.update({ where: { id }, data: { active: ativa } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ativa ? "financeCategory.activate" : "financeCategory.deactivate",
    entityType: "FinanceCategory",
    entityId: id,
    metadata: { name: existente.name },
  });

  revalidatePath("/admin/plano-de-contas");
}

/**
 * Carrega o plano padrão da 41 (`PLANO_PADRAO_41`) no plano do escritório.
 * Rodar de novo não duplica nem desfaz ajuste — ver `planejarCarga`.
 */
export async function carregarPlanoPadrao(): Promise<{ error: string } | { ok: true; mensagem: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { error: "Sem permissão para editar o plano de contas." };

  const prisma = getPrisma();
  const existentes = await prisma.financeCategory.findMany({
    where: ondeDoPadrao(ctx.tenantId),
    select: { id: true, name: true, kind: true, planGroup: true, dreGroup: true },
  });
  const plano = planejarCarga(existentes, PLANO_PADRAO_41);

  await prisma.$transaction(async (tx) => {
    if (plano.criar.length > 0) {
      await tx.financeCategory.createMany({
        data: plano.criar.map((c) => ({
          tenantId: ctx.tenantId!,
          name: c.nome,
          kind: c.kind,
          planGroup: c.grupo,
          dreGroup: c.dre,
        })),
      });
    }
    for (const m of plano.completar) {
      await tx.financeCategory.update({
        where: { id: m.id },
        data: { ...(m.planGroup ? { planGroup: m.planGroup } : {}), ...(m.dreGroup ? { dreGroup: m.dreGroup } : {}) },
      });
    }
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "financeCategory.plano_padrao",
    entityType: "FinanceCategory",
    metadata: { criadas: plano.criar.length, completadas: plano.completar.length, jaCompletas: plano.jaCompletas },
  });
  revalidatePath("/admin/plano-de-contas");
  revalidatePath("/cadastros-financeiros");
  return {
    ok: true,
    mensagem:
      `${plano.criar.length} categoria${plano.criar.length === 1 ? "" : "s"} nova${plano.criar.length === 1 ? "" : "s"}, ` +
      `${plano.completar.length} completada${plano.completar.length === 1 ? "" : "s"} com grupo ou linha da DRE, ` +
      `${plano.jaCompletas} já estava${plano.jaCompletas === 1 ? "" : "m"} em dia.`,
  };
}
