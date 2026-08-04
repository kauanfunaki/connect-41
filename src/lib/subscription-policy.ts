import type { ManagementMode, SubscriptionStatus } from "@/generated/prisma/enums";

// Regra pura de "este workspace está em somente leitura por causa da
// assinatura" — sem acesso a banco, seguro pra importar em Client Component.
// Quem busca os campos é src/lib/auth/context.ts, que chama esta função.
//
// MUDANÇA DE POLÍTICA (2026-08-04, decidida pelo usuário): antes o bloqueio só
// valia para tenants SELF_SERVICE. MANAGED era isento porque contrato e
// cobrança são tratados manualmente pela 41 Tech, e um status desatualizado
// travaria um cliente adimplente. Agora vale para os dois modos — o custo
// aceito é que a equipe precisa manter o status da Subscription em dia.
export function isSubscriptionReadOnly(status: SubscriptionStatus | null | undefined): boolean {
  return status === "PAST_DUE" || status === "CANCELED";
}

// Em MANAGED o cliente não tem a tela /assinatura (ela dá 404 pra esse modo),
// então o banner de somente leitura não pode mandar ele "regularizar" lá.
// Este predicado é o que decide se o banner mostra o link ou manda falar com a
// 41 Tech.
export function canSelfRegularize(managementMode: ManagementMode | null | undefined): boolean {
  return managementMode === "SELF_SERVICE";
}
