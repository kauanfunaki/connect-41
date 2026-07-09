import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { TenantForm } from "@/components/admin/TenantForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { atualizarTenant } from "./actions";

export default async function TenantPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const tenant = await prisma.tenant.findFirst({ where: { id: ctx.tenantId } });
  if (!tenant) notFound();

  return (
    <PageContainer variant="narrow">
      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">
        Empresa (Tenant)
      </h1>
      <p className="text-[13px] text-fg-muted mb-6">
        Dados do workspace da 41 Tech no Connect.
      </p>

      <div className="bg-surface border border-border rounded-lg p-6">
        <TenantForm
          action={atualizarTenant}
          isSuperAdmin={ctx.role === "SUPER_ADMIN"}
          defaultValues={{
            name: tenant.name,
            cnpj: tenant.cnpj ?? undefined,
            slug: tenant.slug,
            plan: tenant.plan,
            active: tenant.active,
          }}
        />
      </div>
    </PageContainer>
  );
}
