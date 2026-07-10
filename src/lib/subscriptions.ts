import { getPrisma } from "@/lib/prisma";

export const MANAGEMENT_MODE_LABEL = {
  MANAGED: "Gerenciado pela 41 Tech",
  SELF_SERVICE: "Autoatendimento (cliente administra)",
} as const;

export const BILLING_TYPE_LABEL = {
  FLAT_MONTHLY: "Valor fixo mensal",
  PER_USER_MONTHLY: "Por usuário/mês",
} as const;

export const SUBSCRIPTION_STATUS_LABEL = {
  TRIAL: "Em teste",
  ACTIVE: "Ativa",
  PAST_DUE: "Em atraso",
  CANCELED: "Cancelada",
} as const;

// Total de usuários ativos do tenant — base pra cobrança PER_USER_MONTHLY e
// pro enforcement de seatLimit em planos self-service.
export async function countActiveUsers(tenantId: string): Promise<number> {
  const prisma = getPrisma();
  return prisma.user.count({ where: { tenantId, active: true } });
}

// Bloqueio leve: só se aplica a tenants SELF_SERVICE com seatLimit definido.
// Tenants MANAGED (cobrança fixa) nunca são bloqueados por quantidade de usuário.
export async function canAddUser(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
  const prisma = getPrisma();
  const [tenant, subscription, activeUsers] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { managementMode: true } }),
    prisma.subscription.findUnique({ where: { tenantId }, select: { seatLimit: true, status: true } }),
    countActiveUsers(tenantId),
  ]);

  if (!tenant || tenant.managementMode !== "SELF_SERVICE") return { allowed: true };
  if (!subscription || subscription.seatLimit == null) return { allowed: true };
  if (activeUsers >= subscription.seatLimit) {
    return {
      allowed: false,
      reason: `Limite de ${subscription.seatLimit} usuários do plano atingido. Solicite upgrade em Configurações → Assinatura.`,
    };
  }
  return { allowed: true };
}
