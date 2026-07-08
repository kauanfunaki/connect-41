import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { ToggleAccessButton } from "@/components/admin/ToggleAccessButton";
import { WorkspaceLogoUpload } from "@/components/admin/WorkspaceLogoUpload";
import { concederAcesso, revogarAcesso } from "../actions";

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
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/workspaces" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Workspaces
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate max-w-[200px]">{tenant.name}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{tenant.name}</h1>
        <p className="text-[13px] text-fg-muted mt-0.5 font-mono">{tenant.cnpj ?? tenant.slug}</p>
      </div>

      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[13px] font-semibold text-fg mb-3">Foto do workspace</h2>
        <WorkspaceLogoUpload tenantId={tenant.id} tenantName={tenant.name} logoUrl={tenant.logoUrl} />
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[13px] font-semibold text-fg mb-1">Acesso de Super Admins</h2>
        <p className="text-[12px] text-fg-muted mb-4">
          Super Admins titulares de outros workspaces podem ganhar acesso pra visualizar este também, sem precisar
          de uma conta separada.
        </p>

        {otherSuperAdmins.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Não há Super Admins em outros workspaces.</p>
        ) : (
          <div className="divide-y divide-border">
            {otherSuperAdmins.map((u) => {
              const hasAccess = grantedIds.has(u.id);
              const toggleAction = hasAccess
                ? revogarAcesso.bind(null, id, u.id)
                : concederAcesso.bind(null, id, u.id);
              return (
                <div key={u.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-fg truncate">{u.name}</p>
                    <p className="text-[11px] text-fg-muted truncate">{u.email}</p>
                  </div>
                  <ToggleAccessButton action={toggleAction} hasAccess={hasAccess} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
