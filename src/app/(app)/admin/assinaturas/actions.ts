"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { countActiveUsers } from "@/lib/subscriptions";
import type { ManagementMode, SubscriptionStatus } from "@/generated/prisma/enums";

// `needsSeatConfirm` faz o formulário revelar o checkbox de confirmação — o
// salvamento não é proibido, só exige um "sim, é isso mesmo" explícito.
export type AssinaturaState = { error: string; needsSeatConfirm?: boolean } | null;

function toDecimal(raw: FormDataEntryValue | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function salvarAssinatura(_prev: AssinaturaState, form: FormData): Promise<AssinaturaState> {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") return { error: "Sem permissão." };

  const tenantId = form.get("tenantId") as string;
  const planId = form.get("planId") as string;
  const managementMode = form.get("managementMode") as ManagementMode;
  const status = form.get("status") as SubscriptionStatus;
  const seatLimitRaw = form.get("seatLimit") as string;
  const seatLimit = seatLimitRaw ? Number(seatLimitRaw) : null;
  const currentPeriodEndRaw = form.get("currentPeriodEnd") as string;
  const currentPeriodEnd = currentPeriodEndRaw ? new Date(currentPeriodEndRaw) : null;
  const setupFeeAmount = toDecimal(form.get("setupFeeAmount"));
  const setupFeePaid = form.get("setupFeePaid") === "on";
  const notes = (form.get("notes") as string)?.trim() || null;

  if (!tenantId) return { error: "Tenant inválido." };
  if (!planId) return { error: "Selecione um plano." };

  const prisma = getPrisma();
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) return { error: "Plano não encontrado." };

  // Definir um seatLimit abaixo do headcount atual não é bloqueado (pode ser
  // downgrade combinado, com desativação de usuários logo em seguida), mas
  // passava batido sem aviso nenhum — e o efeito é o tenant já nascer estourado,
  // sem conseguir adicionar ninguém. Exige confirmação explícita.
  if (managementMode === "SELF_SERVICE" && seatLimit != null) {
    const activeUsers = await countActiveUsers(tenantId);
    if (seatLimit < activeUsers && form.get("confirmSeatBelowHeadcount") !== "on") {
      return {
        error: `Este workspace tem ${activeUsers} usuários ativos e o limite informado é ${seatLimit}. Nenhum usuário será desativado automaticamente, mas não será possível adicionar novos até ficar dentro do limite.`,
        needsSeatConfirm: true,
      };
    }
  }

  const existing = await prisma.subscription.findUnique({ where: { tenantId } });

  await prisma.$transaction([
    prisma.tenant.update({ where: { id: tenantId }, data: { managementMode } }),
    prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        planId,
        status,
        seatLimit,
        currentPeriodEnd,
        setupFeeAmount: setupFeeAmount ?? plan.setupFee,
        setupFeePaidAt: setupFeePaid ? new Date() : null,
        notes,
      },
      update: {
        planId,
        status,
        seatLimit,
        currentPeriodEnd,
        setupFeeAmount: setupFeeAmount ?? plan.setupFee,
        setupFeePaidAt: setupFeePaid ? (existing?.setupFeePaidAt ?? new Date()) : null,
        notes,
      },
    }),
  ]);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: existing ? "subscription.update" : "subscription.create",
    entityType: "Subscription",
    entityId: tenantId,
    metadata: { planId, status, managementMode },
  });

  // "layout" a partir da raiz, não só esta página: o banner de somente-leitura
  // é renderizado pelo layout de (app), então revalidar apenas /admin/assinaturas
  // deixava o resto do app com o estado antigo até o cache expirar — mudar o
  // status pra PAST_DUE não acendia o banner em lugar nenhum.
  revalidatePath("/", "layout");
  return null;
}
