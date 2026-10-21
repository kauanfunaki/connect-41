import { notFound } from "next/navigation";
import { Building2, CalendarClock, Mail, Palette } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { TenantForm } from "@/components/admin/TenantForm";
import { SmtpConfigForm } from "@/components/admin/SmtpConfigForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { SecaoDeConfiguracao } from "@/components/configuracoes/SecaoDeConfiguracao";
import { ExpedienteForm } from "@/components/agenda/ExpedienteForm";
import { EXPEDIENTE_PADRAO } from "@/lib/agendaExpediente";
import { carregarExpedienteDoEscritorio } from "@/lib/agendaExpedienteDb";
import { AparenciaDoPortalForm } from "@/components/admin/AparenciaDoPortalForm";
import { FALTA_ATUALIZAR_O_BANCO_DA_APARENCIA, lerAparencia } from "@/lib/aparencia/leitura";
import { atualizarTenant, salvarAparencia, salvarExpedienteDoEscritorio } from "./actions";

export default async function TenantPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [tenant, smtpConfig, expediente, leituraDaAparencia] = await Promise.all([
    prisma.tenant.findFirst({ where: { id: ctx.tenantId } }),
    prisma.tenantSmtpConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
    carregarExpedienteDoEscritorio(ctx.tenantId),
    lerAparencia(ctx.tenantId),
  ]);
  if (!tenant) notFound();

  return (
    <PageContainer>
      <PageHeader
        title="Empresa (tenant)"
        subtitle="Os dados deste workspace no Connect."
      />

      {/* Seções em duas colunas (escolha 1B dos Ajustes de 15/10): o título e o
          que a seção faz à esquerda, o cartão com os campos à direita. Era uma
          coluna de 720px presa à esquerda, com o resto da tela vazio. */}
      <SecaoDeConfiguracao
        titulo="Dados do escritório"
        descricao="Nome e CNPJ como aparecem nos documentos e no portal."
        icone={<Building2 />}
      >
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
      </SecaoDeConfiguracao>

      {/* A aparência do portal (21/10/2026): a cor do escritório, uma cor por
          grupo de telas (no jeito do Omie) e o logo. O `id` é o destino do
          link da Administração › Portal do cliente. */}
      <SecaoDeConfiguracao
        id="aparencia-do-portal"
        titulo="Aparência"
        descricao="A cor e o logo que os clientes do escritório veem no portal, e uma cor para cada grupo de telas — no portal e no Connect da equipe. A prévia mostra os dois temas antes de salvar."
        icone={<Palette />}
      >
        {leituraDaAparencia.situacao === "sem-tabela" && <Aviso tom="atencao">{FALTA_ATUALIZAR_O_BANCO_DA_APARENCIA}</Aviso>}
        {leituraDaAparencia.situacao === "erro" && (
          <Aviso>Não foi possível ler a aparência agora. Atualize a página em instantes antes de salvar.</Aviso>
        )}
        <Card className="p-6">
          <AparenciaDoPortalForm
            action={salvarAparencia}
            inicial={leituraDaAparencia.aparencia}
            tenantId={ctx.tenantId}
            escritorio={leituraDaAparencia.escritorio}
            bloqueado={leituraDaAparencia.situacao !== "ok"}
          />
        </Card>
      </SecaoDeConfiguracao>

      {/* Horário da Agenda (05/10/2026): o padrão de quem não definiu um
          próprio em /configuracoes. O `id` é o destino do item "Horário da
          Agenda" da área do escritório, no início das configurações (14/10/2026). */}
      <SecaoDeConfiguracao
        id="horario-da-agenda"
        titulo="Horário da Agenda"
        descricao="As horas que a grade de dia e de semana mostra. Vale para todo o escritório; cada pessoa pode trocar pelo seu em Sua conta."
        icone={<CalendarClock />}
      >
        <Card className="p-6">
          <ExpedienteForm action={salvarExpedienteDoEscritorio} valor={expediente ?? EXPEDIENTE_PADRAO} />
        </Card>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao
        titulo="E-mail de envio (SMTP)"
        descricao="A conta que manda documentos aos clientes, com prova de recebimento. Cada workspace usa a sua."
        icone={<Mail />}
      >
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
      </SecaoDeConfiguracao>
    </PageContainer>
  );
}
