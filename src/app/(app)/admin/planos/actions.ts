"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import type { ManagementMode, BillingType } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

export type PlanoState = { error: string } | null;

function toDecimal(raw: FormDataEntryValue | null): number {
  const n = Number(String(raw ?? "0").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function criarPlano(_prev: PlanoState, form: FormData): Promise<PlanoState> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { error: "Sem permissão." };

  const name = (form.get("name") as string)?.trim();
  const managementMode = form.get("managementMode") as ManagementMode;
  const billingType = form.get("billingType") as BillingType;
  const basePrice = toDecimal(form.get("basePrice"));
  const pricePerUserRaw = form.get("pricePerUser");
  const pricePerUser = pricePerUserRaw ? toDecimal(pricePerUserRaw) : null;
  const setupFee = toDecimal(form.get("setupFee"));

  if (!name) return { error: "Nome do plano é obrigatório." };
  if (managementMode !== "MANAGED" && managementMode !== "SELF_SERVICE") return { error: "Modo de gestão inválido." };
  if (billingType !== "FLAT_MONTHLY" && billingType !== "PER_USER_MONTHLY") return { error: "Tipo de cobrança inválido." };
  if (billingType === "PER_USER_MONTHLY" && !pricePerUser) return { error: "Informe o valor por usuário." };

  const prisma = getPrisma();
  const plan = await prisma.subscriptionPlan.create({
    data: { name, managementMode, billingType, basePrice, pricePerUser, setupFee },
  });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "subscription_plan.create", entityType: "SubscriptionPlan", entityId: plan.id, metadata: { name } });

  revalidatePath("/admin/planos");
  return null;
}

// null = plano libera todos os módulos do catálogo (sem restrição comercial) —
// TenantModule continua sendo o ajuste fino por tenant dentro do que o plano permite.
export async function atualizarModulosPlano(planId: string, moduleCodes: string[] | null): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: { allowedModuleCodes: moduleCodes === null ? Prisma.DbNull : moduleCodes },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "subscription_plan.update_modules",
    entityType: "SubscriptionPlan",
    entityId: planId,
    metadata: { moduleCodes },
  });

  revalidatePath("/admin/planos");
}

export async function alternarPlano(id: string, active: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return;

  const prisma = getPrisma();
  await prisma.subscriptionPlan.update({ where: { id }, data: { active } });

  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: active ? "subscription_plan.activate" : "subscription_plan.deactivate", entityType: "SubscriptionPlan", entityId: id });

  revalidatePath("/admin/planos");
}
