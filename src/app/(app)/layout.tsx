import { AppShell } from "@/components/shell/AppShell";
import { SessionKeeper } from "@/components/shell/SessionKeeper";
import { MeetingAlertOverlay } from "@/components/shell/MeetingAlertOverlay";
import { AvisoDeVersaoNova } from "@/components/shell/AvisoDeVersaoNova";
import { DicaFlutuante } from "@/components/shared/DicaFlutuante";
import { ToastProvider } from "@/components/ui/Toast";
import { getSectorMaps } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { getAuthContext, isFullAccess, isFullWrite, canViewSector } from "@/lib/auth/context";
import { codigosDeTelasFixadas } from "@/lib/telasFixadas-data";
import { telasFixadasVisiveis } from "@/lib/telasFixadas";
import { getPrisma } from "@/lib/prisma";
import { contarNaoLidasVisiveis, tiposOcultos } from "@/lib/notificacoes/consultas";
import { getSectorsWithEnabledModules, getTenantModuleStates } from "@/lib/modules";
import { getModuleRoute, MODULOS_DO_MENU_GERAL } from "@/lib/module-catalog";
import { baseDomain, hostSuffix, setoresDoSeletor } from "@/lib/auth/activeSector";
import { ChatDeIA } from "@/components/shell/ChatDeIA";
import { agentesDoChat } from "@/lib/ia/chat/agentes";
import { PARES_DE_CAMINHO } from "@/lib/ajuda/artigos";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAuthContext();
  const { role, sectors, tenantId } = ctx;
  const isAdmin = isFullWrite(role);
  const canManageFields = isAdmin || (role === "SECTOR_ADMIN" && sectors.length > 0);
  const canOpenAdmin = isAdmin || canManageFields;
  const { labels: sectorLabels, colors: sectorColors, options: sectorOptions } = await getSectorMaps(tenantId);
  const sectorsWithModules = await getSectorsWithEnabledModules(tenantId);
  const visibleSectors = setoresDoSeletor({
    userSectors: sectors,
    isFullAccess: isFullAccess(role),
    visitante: tenantId !== ctx.homeTenantId,
    setoresDoEscritorio: sectorOptions.map((o) => o.value),
  })
    .filter((s) => sectorsWithModules.has(s))
    .map((s) => ({ code: s, label: sectorLabels[s] ?? s, color: sectorColors[s] ?? "#586577" }));

  // Setor ativo (subworkspace). Resolvido em getAuthContext a partir do host e
  // do cookie; aqui só se completa com label e cor do cadastro do tenant.
  //
  // Um código que não existe neste tenant cai em "Todos" — o proxy não tem como
  // conferir existência sem ir ao banco, e conferir aqui é de graça porque os
  // setores já foram carregados.
  const activeSector =
    ctx.activeSector && sectorLabels[ctx.activeSector]
      ? {
          code: ctx.activeSector,
          label: sectorLabels[ctx.activeSector]!,
          color: sectorColors[ctx.activeSector] ?? "#586577",
        }
      : null;

  // Pelo estado do tenant, e não pelo catálogo: um módulo transferido (o DRE no
  // Financeiro) aparece no setor que o opera, não no de origem.
  //
  // Carregado sempre, e não só com setor ativo: o Ctrl+K busca tela de qualquer
  // setor que a pessoa enxerga, e as fixadas também atravessam setor.
  const moduleStates = await getTenantModuleStates(tenantId);
  const telasNavegaveis = moduleStates
    .filter((m) => m.enabled && canViewSector(ctx, m.sectorCode))
    .map((m) => ({
      code: m.code,
      label: m.label,
      href: getModuleRoute(m.code) ?? `/setor/${m.sectorCode}/${m.code}`,
      setor: sectorLabels[m.sectorCode] ?? m.sectorCode,
    }));
  // A fila das solicitações do portal mora no menu Geral (ver MODULOS_DO_MENU_GERAL).
  const solicitacoesLigadas = moduleStates.some((m) => m.code === "portal_solicitacoes" && m.enabled);
  const activeSectorModules = activeSector
    ? moduleStates
        .filter((m) => m.enabled && m.sectorCode === activeSector.code && !MODULOS_DO_MENU_GERAL.has(m.code))
        .map((m) => ({ code: m.code, label: m.label, href: getModuleRoute(m.code) ?? `/setor/${activeSector.code}/${m.code}` }))
    : [];
  // Fixadas: a ordem é a que a pessoa escolheu, e o filtro é o que ela pode
  // abrir agora — fixada de módulo desligado depois continua guardada, só não
  // aparece (ver `telasFixadasVisiveis`).
  const telasFixadas = telasFixadasVisiveis(await codigosDeTelasFixadas(ctx.userId, tenantId), telasNavegaveis);

  // O chat de IA do canto da tela: a lista vazia (fora do piloto, nenhum
  // agente ligado, sem chave) é o que esconde o botão. Falha aqui não pode
  // derrubar o app — sem chat é o estado seguro.
  const agentesDoChatDeIA = await agentesDoChat(ctx).catch((err) => {
    console.error("[chat-ia] agentes do chat", err);
    return [];
  });

  const prisma = getPrisma();
  // Só o contador do sino: a lista é buscada quando o sino abre (02/10/2026) —
  // vinda daqui, ela envelhecia, porque o layout não re-renderiza ao navegar.
  // Sem as arquivadas e os tipos ocultos (05/10/2026). Falha aqui não derruba
  // o app inteiro (deploy antes da migration, por exemplo): o sino fica sem número.
  const dono = { tenantId, userId: ctx.userId };
  const [unreadCount, me, accessibleTenants] = await Promise.all([
    ctx.userId
      ? tiposOcultos(dono)
          .then((ocultos) => contarNaoLidasVisiveis(dono, ocultos))
          .catch((err) => {
            console.error("[layout] contador do sino", err);
            return 0;
          })
      : Promise.resolve(0),
    ctx.userId
      ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, photoUrl: true } })
      : Promise.resolve(null),
    role === "SUPER_ADMIN"
      ? prisma.tenant.findMany({
          where: { OR: [{ id: ctx.homeTenantId }, { accessGrants: { some: { userId: ctx.userId } } }] },
          select: { id: true, name: true, logoUrl: true },
          orderBy: { name: "asc" },
        })
      // Sem múltiplos tenants: busca só o nome do tenant atual, pro seletor de
      // workspace da sidebar mostrar o nome real mesmo sem troca disponível.
      : prisma.tenant.findMany({
          where: { id: tenantId },
          select: { id: true, name: true, logoUrl: true },
        }),
  ]);

  return (
    <ToastProvider>
      <AppShell
        tenantId={tenantId}
        accessibleTenants={accessibleTenants}
        sectors={visibleSectors}
        activeSector={activeSector}
        activeSectorModules={activeSectorModules}
        telasNavegaveis={telasNavegaveis}
        telasFixadas={telasFixadas}
        appDomain={baseDomain()}
        sectorHostSuffix={hostSuffix()}
        canOpenAdmin={canOpenAdmin}
        unreadCount={unreadCount}
        solicitacoesLigadas={solicitacoesLigadas}
        profileName={me?.name ?? "Usuário"}
        profileRoleLabel={ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
        profilePhotoUrl={me?.photoUrl ?? null}
        subscriptionReadOnly={ctx.subscriptionReadOnly}
        canSelfRegularizeSubscription={ctx.canSelfRegularizeSubscription}
        paresDeAjuda={PARES_DE_CAMINHO}
      >
        <SessionKeeper />
        <MeetingAlertOverlay />
        <AvisoDeVersaoNova />
        <DicaFlutuante />
        {children}
        <ChatDeIA agentes={agentesDoChatDeIA} nome={me?.name ?? ""} coresDosSetores={sectorColors} />
      </AppShell>
    </ToastProvider>
  );
}
