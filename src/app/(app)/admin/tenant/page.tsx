import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { TenantForm } from "@/components/admin/TenantForm";
import { SmtpConfigForm } from "@/components/admin/SmtpConfigForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { atualizarTenant } from "./actions";

export default async function TenantPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [tenant, smtpConfig] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: ctx.tenantId } }),
    prisma.tenantSmtpConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
  ]);
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

      <h2 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1 mt-10">
        E-mail (SMTP)
      </h2>
      <p className="text-[13px] text-fg-muted mb-6">
        Usado para enviar documentos a clientes com prova de recebimento. Cada workspace usa sua própria conta de e-mail.
      </p>

      <div className="bg-surface border border-border rounded-lg p-6">
        <SmtpConfigForm
          hasConfig={!!smtpConfig}
          defaultValues={
            smtpConfig
              ? {
                  host: smtpConfig.host,
                  port: smtpConfig.port,
                  secure: smtpConfig.secure,
                  username: smtpConfig.username,
                  fromName: smtpConfig.fromName,
                  fromEmail: smtpConfig.fromEmail,
                }
              : undefined
          }
        />
      </div>
    </PageContainer>
  );
}
