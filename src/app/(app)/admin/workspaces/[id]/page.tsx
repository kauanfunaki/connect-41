import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { ToggleAccessButton } from "@/components/admin/ToggleAccessButton";
import { WorkspaceLogoUpload } from "@/components/admin/WorkspaceLogoUpload";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { concederAcesso, revogarAcesso } from "../actions";
import { formatCnpj } from "@/lib/format";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) notFound();

  // SUPER_ADMINs de outros tenants — candidatos a ganhar acesso a este workspace.
  // Quem já é "titular" deste tenant (User.tenantId === id) já enxerga por padrão.
  const [otherSuperAdmins, grants] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPER_ADMIN", tenantId: { not: id } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, tenantId: true },
    }),
    prisma.userTenantAccess.findMany({ where: { tenantId: id }, select: { userId: true } }),
  ]);
  const grantedIds = new Set(grants.map((g) => g.userId));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Workspaces", href: "/admin/workspaces" }, { label: tenant.name, truncate: true }]} />

      {/* O CNPJ era um parágrafo solto embaixo do cabeçalho; é o subtítulo dele. */}
      <PageHeader
        title={tenant.name}
        subtitle={<span className="font-mono">{tenant.cnpj ? formatCnpj(tenant.cnpj) : tenant.slug}</span>}
      />

      {/* Os dois blocos no mesmo componente de cartão (o segundo era um div
          com as classes copiadas) e com o mesmo cabeçalho: título e, embaixo,
          a explicação. */}
      <Card className="p-5 mb-4">
        <h2 className="text-card-title font-semibold text-fg mb-3">Foto do workspace</h2>
        <WorkspaceLogoUpload tenantId={tenant.id} tenantName={tenant.name} logoUrl={tenant.logoUrl} />
      </Card>

      <Card className="p-5">
        <h2 className="text-card-title font-semibold text-fg">Acesso de Super Admins</h2>
        <p className="text-helper text-fg-muted mt-0.5 mb-4">
          Super Admins titulares de outros workspaces podem ganhar acesso pra visualizar este também, sem precisar
          de uma conta separada.
        </p>

        {otherSuperAdmins.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">Não há Super Admins em outros workspaces.</p>
        ) : (
          <div className="divide-y divide-border">
            {otherSuperAdmins.map((u) => {
              const hasAccess = grantedIds.has(u.id);
              const toggleAction = hasAccess
                ? revogarAcesso.bind(null, id, u.id)
                : concederAcesso.bind(null, id, u.id);
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-fs-3 text-fg truncate">{u.name}</p>
                    <p className="text-fs-1 text-fg-muted truncate">{u.email}</p>
                  </div>
                  <ToggleAccessButton action={toggleAction} hasAccess={hasAccess} />
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
