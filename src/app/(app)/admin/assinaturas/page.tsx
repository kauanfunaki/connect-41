import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Building2, Receipt } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { AssinaturaRow } from "@/components/admin/AssinaturaRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

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
      {/* O atalho para o catálogo era texto azul com seta ao lado do título;
          no cabeçalho, ação é botão (polimento de 30/09). */}
      <PageHeader
        title="Assinaturas"
        subtitle="Plano, modo de gestão e status de cobrança de cada cliente."
        action={
          <Button href="/admin/planos" variant="secondary">
            <Receipt size={14} /> Gerenciar catálogo de planos
          </Button>
        }
      />

      {tenants.length === 0 ? (
        <Card>
          <EmptyState icon={<Building2 />} title="Nenhum tenant cadastrado" />
        </Card>
      ) : (
        <Card className="divide-y divide-border">
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
        </Card>
      )}
    </PageContainer>
  );
}
