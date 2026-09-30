import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
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
    <PageContainer>
      <PageHeader
        title="Empresa (Tenant)"
        subtitle="Dados do workspace da 41 Tech no Connect."
      />

      {/* Coluna de formulário (720px), como nas outras telas de cadastro: na
          largura da página, o nome e o host SMTP viravam campos de 1.000px. */}
      <div className="max-w-[720px]">
        <Card className="p-6">
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
        </Card>

        <div className="mt-10 mb-4">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">E-mail (SMTP)</h2>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-0.5">
            Usado para enviar documentos a clientes com prova de recebimento. Cada workspace usa sua própria conta de e-mail.
          </p>
        </div>

        <Card className="p-6">
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
        </Card>
      </div>
    </PageContainer>
  );
}
