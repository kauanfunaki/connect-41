import { cache } from "react";
import { headers } from "next/headers";
import type { UserRole } from "@/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { isSubscriptionReadOnly, canSelfRegularize } from "@/lib/subscription-policy";
import { HEADER_SETOR_ATIVO, resolveActiveSector, sectorScope } from "@/lib/auth/activeSector";
import { isFullAccess } from "./papeis";

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
  // Subworkspace: em qual setor a pessoa está agora. `null` = "Todos os
  // setores", que é sempre a união do que ela já podia ver — nunca mais.
  //
  // É FILTRO DE VISÃO PADRÃO, NÃO PERMISSÃO. canViewSector/canActOnSector/
  // canManageSector continuam decidindo sozinhos, a partir de `sectors` e
  // `role`; nenhum deles olha para cá. Quem tem dois setores não pode receber
  // "sem permissão" por causa do seletor — só ver menos por padrão.
  activeSector: string | null;
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
  const role = (h.get("x-user-role") ?? "SECTOR_USER") as UserRole;
  const sectors = h.get("x-user-sectors")?.split(",").filter(Boolean) ?? [];
  return {
    userId: h.get("x-user-id") ?? "",
    tenantId,
    homeTenantId: h.get("x-home-tenant-id") ?? tenantId,
    role,
    sectors,
    subscriptionReadOnly: subscription.readOnly,
    canSelfRegularizeSubscription: subscription.canSelfRegularize,
    activeSector: resolveActiveSector({
      hint: h.get(HEADER_SETOR_ATIVO),
      userSectors: sectors,
      isFullAccess: isFullAccess(role),
    }),
  };
}

/**
 * Códigos de setor que devem filtrar uma consulta neste contexto. `null`
 * significa sem filtro — só acontece para quem é full access e está em "Todos
 * os setores".
 *
 * Use para ESCOPO DE LEITURA. Para autorizar escrita continue usando
 * canActOnSector/canManageSector, que não olham o setor ativo.
 */
export function scopedSectors(ctx: AuthContext): string[] | null {
  return sectorScope(ctx.activeSector, ctx.sectors, isFullAccess(ctx.role));
}

// As regras de papel (isFullAccess, canAct, canViewSector...) moram em
// ./papeis.ts desde 09/10/2026: são funções puras, e este arquivo depende de
// next/headers e do Prisma — componente de cliente e o motor de alertas (que
// roda na instrumentação) não podem importar daqui. Reexportadas para quem já
// importava deste arquivo.
export { isFullAccess, isFullWrite, canWrite, canAct, canManageSector, canActOnSector, canViewSector } from "./papeis";
