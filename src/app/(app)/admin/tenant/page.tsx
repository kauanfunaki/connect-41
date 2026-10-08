import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { TenantForm } from "@/components/admin/TenantForm";
import { SmtpConfigForm } from "@/components/admin/SmtpConfigForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { ExpedienteForm } from "@/components/agenda/ExpedienteForm";
import { EXPEDIENTE_PADRAO } from "@/lib/agendaExpediente";
import { carregarExpedienteDoEscritorio } from "@/lib/agendaExpedienteDb";
import { atualizarTenant, salvarExpedienteDoEscritorio } from "./actions";

export default async function TenantPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [tenant, smtpConfig, expediente] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: ctx.tenantId } }),
    prisma.tenantSmtpConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    carregarExpedienteDoEscritorio(ctx.tenantId),
  ]);
  if (!tenant) notFound();

  return (
    <PageContainer>
      <PageHeader
        title="Empresa (tenant)"
        subtitle="Os dados deste workspace no Connect."
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

        {/* Horário da Agenda (05/10/2026): o padrão de quem não definiu um
            próprio em /configuracoes. */}
        <div className="mt-10 mb-4">
          <h2 className="text-section font-semibold text-fg">Horário da Agenda</h2>
          <p className="text-helper text-fg-muted mt-0.5">
            As horas que a grade de dia e de semana mostra. Vale para todo o escritório; cada pessoa pode trocar pelo seu em Configurações.
          </p>
        </div>

        <Card className="p-6">
          <ExpedienteForm action={salvarExpedienteDoEscritorio} valor={expediente ?? EXPEDIENTE_PADRAO} />
        </Card>

        <div className="mt-10 mb-4">
          <h2 className="text-section font-semibold text-fg">E-mail (SMTP)</h2>
          <p className="text-helper text-fg-muted mt-0.5">
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
