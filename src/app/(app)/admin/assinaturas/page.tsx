import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { AssinaturaRow } from "@/components/admin/AssinaturaRow";
import { EmptyState } from "@/components/ui/EmptyState";
import Link from "next/link";

export default async function AssinaturasPage() {
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const [tenants, plans, userCounts] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { name: "asc" },
      include: { subscription: true },
    }),
    prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, managementMode: true },
    }),
    prisma.user.groupBy({ by: ["tenantId"], where: { active: true }, _count: { _all: true } }),
  ]);

  const activeUsersByTenant = new Map(userCounts.map((u) => [u.tenantId, u._count._all]));

  return (
    <PageContainer>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Assinaturas</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            Plano, modo de gestão e status de cobrança de cada cliente.
          </p>
        </div>
        <Link href="/admin/planos" className="text-[12px] text-brand hover:underline flex-shrink-0">
          Gerenciar catálogo de planos →
        </Link>
      </div>

      {tenants.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState title="Nenhum tenant cadastrado." />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {tenants.map((t) => (
            <AssinaturaRow
              key={t.id}
              tenant={{ id: t.id, name: t.name, managementMode: t.managementMode }}
              subscription={
                t.subscription
                  ? {
                      planId: t.subscription.planId,
                      status: t.subscription.status,
                      seatLimit: t.subscription.seatLimit,
                      currentPeriodEnd: t.subscription.currentPeriodEnd?.toISOString() ?? null,
                      setupFeeAmount: t.subscription.setupFeeAmount?.toString() ?? null,
                      setupFeePaidAt: t.subscription.setupFeePaidAt?.toISOString() ?? null,
                      notes: t.subscription.notes,
                    }
                  : null
              }
              plans={plans}
              activeUsers={activeUsersByTenant.get(t.id) ?? 0}
            />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
