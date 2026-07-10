// Constantes puras (sem acesso a banco/Prisma) — seguro pra importar em
// Client Components. Separado de src/lib/subscriptions.ts pra não arrastar
// o client Prisma (e o adapter MariaDB, que usa módulos Node como `tls`)
// pro bundle do browser.
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
