import { PageHeader } from "@/components/ui/PageHeader";
import { SecaoDeConfiguracao } from "@/components/configuracoes/SecaoDeConfiguracao";
import { notFound } from "next/navigation";
import { ChevronRight, UserRound, ShieldCheck, KeyRound, Palette, Bell, Settings2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { menuDasConfiguracoes } from "@/lib/configuracoes/areas";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { PageContainer } from "@/components/shared/PageContainer";
import { PerfilForm } from "@/components/configuracoes/PerfilForm";
import { AlterarSenhaForm } from "@/components/configuracoes/AlterarSenhaForm";
import { TemaSelector } from "@/components/configuracoes/TemaSelector";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { salvarPushSubscription, removerPushSubscription } from "@/app/(app)/notificacoes/actions";
import { getVapidPublicKey } from "@/lib/vapid";
import { ExpedienteForm } from "@/components/agenda/ExpedienteForm";
import { EXPEDIENTE_PADRAO } from "@/lib/agendaExpediente";
import { carregarExpedientes } from "@/lib/agendaExpedienteDb";
import { atualizarMeuPerfil, alterarMinhaSenha, salvarMeuExpediente } from "./actions";

// Configurações da conta do próprio usuário — o que antes era só um botão
// desabilitado ("Em breve") no rodapé da sidebar pra quem não é admin. Nada
// aqui gerencia o workspace: papel e setores aparecem como leitura, e mudar
// qualquer um dos dois continua sendo /admin/usuarios.
export default async function ConfiguracoesPage() {
  const ctx = await getAuthContext();
  if (!ctx.userId) notFound();

  const prisma = getPrisma();
  const [me, { labels: sectorLabels }, expedientes] = await Promise.all([
    prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { name: true, email: true, photoUrl: true },
    }),
    getSectorMaps(ctx.tenantId),
    carregarExpedientes(ctx.tenantId, ctx.userId),
  ]);
  if (!me) notFound();
  const doEscritorio = expedientes.escritorio ?? EXPEDIENTE_PADRAO;

  const roleLabel = ROLE_LABELS[ctx.role as keyof typeof ROLE_LABELS] ?? ctx.role;
  // Quem configura o escritório (o `menuDasConfiguracoes` de 14/10/2026) vê
  // aqui "Sua conta", e a trilha diz "Configurações › Sua conta"; para os
  // outros, esta é a tela de configurações inteira.
  const temMenu = menuDasConfiguracoes({ role: ctx.role, setores: ctx.sectors.length, autoatendimento: false }) !== null;

  return (
    <PageContainer>
      <PageHeader
        title={temMenu ? "Sua conta" : "Configurações"}
        subtitle="Sua conta e suas preferências neste workspace."
      />

      <SecaoDeConfiguracao titulo="Perfil" descricao="Seu nome e sua foto, como aparecem para a equipe." icone={<UserRound />}>
        <PerfilForm
          action={atualizarMeuPerfil}
          defaultName={me.name}
          email={me.email}
          photoUrl={me.photoUrl}
        />
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao titulo="Acesso" descricao="Seu papel e os setores em que você atua. Quem define é um administrador do workspace." icone={<ShieldCheck />}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-helper text-fg-muted">Papel</dt>
            <dd className="text-body text-fg mt-0.5">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-helper text-fg-muted">Setores</dt>
            <dd className="text-body text-fg mt-0.5">
              {ctx.sectors.length > 0
                ? ctx.sectors.map((code) => sectorLabel(sectorLabels, code)).join(", ")
                : "Nenhum setor atribuído"}
            </dd>
          </div>
        </dl>
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao titulo="Segurança" descricao="Troque a sua senha de acesso ao Connect." icone={<KeyRound />}>
        <AlterarSenhaForm action={alterarMinhaSenha} />
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao titulo="Aparência" descricao="Escolha o tema claro, o escuro, ou siga o tema do seu aparelho." icone={<Palette />}>
        <TemaSelector />
      </SecaoDeConfiguracao>

      {/* 05/10/2026: quem trabalha à noite ou de madrugada não via as
          próprias reuniões na grade fixa das 7h às 21h. */}
      <SecaoDeConfiguracao titulo="Agenda" descricao="As horas que a grade de dia e de semana da Agenda mostra para você." icone={<CalendarClock />}>
        <ExpedienteForm
          action={salvarMeuExpediente}
          valor={expedientes.pessoa ?? doEscritorio}
          doEscritorio={{ expediente: doEscritorio, seguindo: expedientes.pessoa === null }}
        />
      </SecaoDeConfiguracao>

      <SecaoDeConfiguracao titulo="Notificações" descricao="Avisos no celular e no navegador, e o histórico do que chegou." icone={<Bell />}>
        <PushNotificationToggle
          publicKey={getVapidPublicKey()}
          acoes={{ salvar: salvarPushSubscription, remover: removerPushSubscription }}
        />
        {/* O cartão-atalho do app (`Card href`): borda azul, sobe 2px. */}
        <Card
          href="/notificacoes"
          className="group flex items-center justify-between gap-2 px-3.5 py-2.5"
        >
          <span className="text-fs-3 text-fg">Ver todas as notificações</span>
          <ChevronRight size={16} className="text-fg-muted group-hover:text-fg transition-colors" />
        </Card>
        {/* 05/10/2026: os tipos que aparecem em cada aba do sino e da central. */}
        <Card
          href="/notificacoes?preferencias=abrir"
          className="group flex items-center justify-between gap-2 px-3.5 py-2.5"
        >
          <span className="text-fs-3 text-fg">Escolher o que cada aba mostra</span>
          <ChevronRight size={16} className="text-fg-muted group-hover:text-fg transition-colors" />
        </Card>
      </SecaoDeConfiguracao>

      {isFullWrite(ctx.role) && (
        <SecaoDeConfiguracao
          titulo="Workspace"
          descricao="Usuários, setores, módulos, integrações e o resto do que vale para todo mundo."
          icone={<Settings2 />}
        >
          <Button href="/admin" variant="secondary">
            <Settings2 size={14} /> Abrir as configurações do escritório
          </Button>
        </SecaoDeConfiguracao>
      )}
    </PageContainer>
  );
}
