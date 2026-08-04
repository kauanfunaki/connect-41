import { cache } from "react";
import { headers } from "next/headers";
import type { UserRole } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { isSubscriptionReadOnly, canSelfRegularize } from "@/lib/subscription-policy";

export interface AuthContext {
  userId: string;
  tenantId: string;
  homeTenantId: string;
  role: UserRole;
  sectors: string[];
  // true quando a assinatura do tenant está PAST_DUE/CANCELED — bloqueia
  // canActOnSector/canManageSector (ver abaixo). Desde 2026-08-04 vale para os
  // dois modos de gestão, MANAGED inclusive (ver src/lib/subscription-policy.ts).
  // Note que o seatLimit em src/lib/subscriptions.ts NÃO acompanhou: ele segue
  // exclusivo de SELF_SERVICE, porque em MANAGED a cobrança é por contrato e
  // não por assento.
  subscriptionReadOnly: boolean;
  // Só SELF_SERVICE enxerga /assinatura — usado pra decidir se o banner de
  // somente leitura oferece o link de regularizar ou manda falar com a 41 Tech.
  canSelfRegularizeSubscription: boolean;
}

// cache() por requisição: getAuthContext() é chamado uma vez por server
// action/página, mas várias vezes dentro da árvore de uma mesma requisição
// (layout + página + componentes aninhados) — sem isso cada chamada bateria
// no banco de novo só pra saber o status da assinatura.
const getSubscriptionState = cache(
  async (tenantId: string): Promise<{ readOnly: boolean; canSelfRegularize: boolean }> => {
    if (!tenantId) return { readOnly: false, canSelfRegularize: false };
    const prisma = getPrisma();
    const [tenant, subscription] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { managementMode: true } }),
      prisma.subscription.findUnique({ where: { tenantId }, select: { status: true } }),
    ]);
    return {
      readOnly: isSubscriptionReadOnly(subscription?.status),
      canSelfRegularize: canSelfRegularize(tenant?.managementMode),
    };
  },
);

export async function getAuthContext(): Promise<AuthContext> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id") ?? "";
  const subscription = await getSubscriptionState(tenantId);
  return {
    userId: h.get("x-user-id") ?? "",
    tenantId,
    homeTenantId: h.get("x-home-tenant-id") ?? tenantId,
    role: (h.get("x-user-role") ?? "SECTOR_USER") as UserRole,
    sectors: h.get("x-user-sectors")?.split(",").filter(Boolean) ?? [],
    subscriptionReadOnly: subscription.readOnly,
    canSelfRegularizeSubscription: subscription.canSelfRegularize,
  };
}

// SUPER_ADMIN e ADMIN enxergam/gerenciam tudo do tenant; READONLY enxerga tudo mas nunca escreve.
export function isFullAccess(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "READONLY";
}

export function isFullWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

// Pode criar/editar/excluir (fora do escopo estrito de setor de pipeline).
export function canWrite(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "SECTOR_ADMIN";
}

// Pode registrar atividade (nota, mudança de estágio) — inclui SECTOR_USER.
export function canAct(role: UserRole): boolean {
  return role !== "READONLY";
}

export function canManageSector(ctx: AuthContext, sectorCode: string): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullWrite(ctx.role)) return true;
  if (ctx.role === "READONLY") return false;
  return ctx.role === "SECTOR_ADMIN" && ctx.sectors.includes(sectorCode);
}

export function canActOnSector(ctx: AuthContext, sectorCode: string): boolean {
  if (ctx.subscriptionReadOnly) return false;
  if (isFullAccess(ctx.role)) return ctx.role !== "READONLY";
  return ctx.sectors.includes(sectorCode);
}

export function canViewSector(ctx: AuthContext, sectorCode: string): boolean {
  if (isFullAccess(ctx.role)) return true;
  return ctx.sectors.includes(sectorCode);
}
