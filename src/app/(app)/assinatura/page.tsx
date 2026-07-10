import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { countActiveUsers } from "@/lib/subscriptions";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";

// Só existe pra tenants SELF_SERVICE (frente 2 do modelo comercial) — em
// MANAGED é a 41 Tech quem administra a assinatura, o cliente não precisa
// dessa tela.
export default async function AssinaturaPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role) || ctx.role === "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const [tenant, subscription, activeUsers] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { managementMode: true } }),
    prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId }, include: { plan: true } }),
    countActiveUsers(ctx.tenantId),
  ]);

  if (!tenant || tenant.managementMode !== "SELF_SERVICE") notFound();

  const fmt = (v: unknown) => (v == null ? "—" : `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  const seatLimit = subscription?.seatLimit ?? null;
  const seatsUsedPct = seatLimit ? Math.min(100, Math.round((activeUsers / seatLimit) * 100)) : null;

  return (
    <PageContainer variant="narrow">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Minha Assinatura</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">Plano contratado e uso atual.</p>
      </div>

      {!subscription ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhuma assinatura configurada ainda. Fale com a 41 Tech.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-lg p-5">
            <p className="text-[11px] text-fg-muted uppercase tracking-wide mb-1">Plano</p>
            <p className="text-[18px] font-semibold text-fg">{subscription.plan.name}</p>
            <p className="text-[13px] text-fg-muted mt-1">
              {subscription.plan.billingType === "FLAT_MONTHLY"
                ? `${fmt(subscription.plan.basePrice)}/mês`
                : `${fmt(subscription.plan.pricePerUser)}/usuário/mês`}
              {" · "}
              Status: {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="text-[12px] text-fg-muted mt-1">
                Próxima renovação: {subscription.currentPeriodEnd.toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          {seatLimit != null && (
            <div className="bg-surface border border-border rounded-lg p-5">
              <p className="text-[11px] text-fg-muted uppercase tracking-wide mb-1">Usuários</p>
              <p className="text-[18px] font-semibold text-fg tnum">{activeUsers} / {seatLimit}</p>
              <div className="w-full h-2 rounded-full bg-surface-2 mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${seatsUsedPct === 100 ? "bg-danger" : "bg-brand"}`}
                  style={{ width: `${seatsUsedPct}%` }}
                />
              </div>
              {seatsUsedPct === 100 && (
                <p className="text-[12px] text-danger mt-2">
                  Limite atingido — novos usuários não podem ser criados até um upgrade.
                </p>
              )}
            </div>
          )}

          <div className="bg-surface border border-border rounded-lg p-5">
            <p className="text-[11px] text-fg-muted uppercase tracking-wide mb-1">Implantação</p>
            <p className="text-[13px] text-fg">
              {subscription.setupFeePaidAt
                ? `Paga em ${subscription.setupFeePaidAt.toLocaleDateString("pt-BR")}`
                : `Pendente${subscription.setupFeeAmount ? ` — ${fmt(subscription.setupFeeAmount)}` : ""}`}
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <p className="text-[13px] text-fg-muted">
              Precisa de mais usuários ou trocar de plano? Entre em contato com a 41 Tech.
            </p>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
