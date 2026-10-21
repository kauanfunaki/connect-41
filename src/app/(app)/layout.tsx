import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/AppShell";
import { COOKIE_DO_MENU_LATERAL, menuRecolhidoDoCookie } from "@/lib/menuLateral";
import { SessionKeeper } from "@/components/shell/SessionKeeper";
import { MeetingAlertOverlay } from "@/components/shell/MeetingAlertOverlay";
import { AvisoDeVersaoNova } from "@/components/shell/AvisoDeVersaoNova";
import { TutorialDaEquipe } from "@/components/tutorial/TutorialDaEquipe";
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
import { getModuleRoute, MODULOS_DO_MENU_GERAL, MODULOS_SEM_MENU } from "@/lib/module-catalog";
import { semTelasDoGeralOcultas } from "@/lib/menuGeral";
import { telasDoGeralDaPessoa } from "@/lib/menuGeralDb";
import { baseDomain, hostSuffix, setoresDoSeletor } from "@/lib/auth/activeSector";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { escritoriosDaTroca } from "@/lib/auth/trocaDeEscritorio";
import { ChatDeIA } from "@/components/shell/ChatDeIA";
import { agentesDoChat } from "@/lib/ia/chat/agentes";
import { PARES_DE_CAMINHO } from "@/lib/ajuda/artigos";
import { configDoHelpdesk } from "@/lib/chamados/contexto";
import { temAcessoAoModulo } from "@/lib/chamados/consultas";
import { aparenciaDoEscritorio } from "@/lib/aparencia/leitura";
import { EstiloDaAparencia } from "@/components/aparencia/EstiloDaAparencia";
import { lerEmpresaEmFoco } from "@/lib/empresas/focoServidor";
import { alcanceDoFoco } from "@/lib/empresas/foco";
import { FaixaDoFoco, ProvedorDoFoco } from "@/components/empresas/FaixaDoFoco";

export default async function AppLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
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
  // Financeiro) aparece no setor que o opera, não no de origem. Uma tela ligada
  // a mais de um setor (21/10/2026) aparece no menu de cada um, com o mesmo
  // endereço; na busca e nas fixadas, uma vez só, com o nome do setor dono.
  //
  // Carregado sempre, e não só com setor ativo: o Ctrl+K busca tela de qualquer
  // setor que a pessoa enxerga, e as fixadas também atravessam setor.
  //
  // O Geral por setor (14/10/2026): as telas do Geral escondidas para o setor
  // escolhido — ou, em "Todos os setores", para todos os setores da pessoa —
  // saem do menu, do Ctrl+K e das fixadas. Pelo setor que a lateral mostra (um
  // código que não existe aqui cai em "Todos", como acima). Só visibilidade:
  // o endereço da tela continua abrindo.
  const [moduleStates, telasDoGeral] = await Promise.all([
    getTenantModuleStates(tenantId),
    telasDoGeralDaPessoa({ ...ctx, activeSector: activeSector?.code ?? null }),
  ]);
  const helpdeskConfig = await configDoHelpdesk(tenantId);
  const chamadosLigados = await temAcessoAoModulo({ ctx, config: helpdeskConfig });
  const telasNavegaveis = semTelasDoGeralOcultas(
    moduleStates
      .filter((m) => m.enabled && !MODULOS_SEM_MENU.has(m.code) && (m.code === "helpdesk" ? chamadosLigados : canViewSector(ctx, m.sectorCodes)))
      .map((m) => ({
        code: m.code,
        label: m.label,
        href: getModuleRoute(m.code) ?? `/setor/${m.sectorCode}/${m.code}`,
        setor: sectorLabels[m.sectorCode] ?? m.sectorCode,
      })),
    telasDoGeral,
  );
  // A fila das solicitações do portal mora no menu Geral (ver MODULOS_DO_MENU_GERAL).
  const solicitacoesLigadas = moduleStates.some((m) => m.code === "portal_solicitacoes" && m.enabled);
  const arquivosLigados = moduleStates.some((m) => m.code === "arquivos" && m.enabled);
  const activeSectorModules = activeSector
    ? moduleStates
        .filter((m) => m.enabled && m.sectorCodes.includes(activeSector.code) && !MODULOS_DO_MENU_GERAL.has(m.code) && !MODULOS_SEM_MENU.has(m.code))
        .map((m) => ({ code: m.code, label: m.code === "bpo_comunicacao" && solicitacoesLigadas ? "Solicitações dos clientes" : m.label, href: m.code === "bpo_comunicacao" && solicitacoesLigadas ? "/solicitacoes" : getModuleRoute(m.code) ?? `/setor/${activeSector.code}/${m.code}` }))
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
  // A cor principal do escritório também aqui, só se ele ligou "Usar também no
  // Connect da equipe" (21/10/2026; desligado por padrão). Os grupos de cor
  // são do portal: a equipe já tem as cores dos setores.
  const [unreadCount, me, accessibleTenants, { aparencia }] = await Promise.all([
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
    // A janela de troca lista os escritórios pela MESMA regra que o token usa
    // para autorizar a troca (`escritoriosAcessiveis`, via
    // getAccessibleTenantIds): SUPER_ADMIN vê o de origem e os concedidos; os
    // demais papéis, só o atual — o nome real no cabeçalho, sem troca.
    getAccessibleTenantIds(ctx.userId, role, ctx.homeTenantId).then((acessiveis) =>
      prisma.tenant.findMany({
        where: { id: { in: escritoriosDaTroca(acessiveis, tenantId) } },
        select: { id: true, name: true, logoUrl: true },
        orderBy: { name: "asc" },
      })
    ),
    aparenciaDoEscritorio(tenantId),
  ]);

  // A empresa em foco (BPO, uma empresa por vez — 21/10/2026): a faixa do
  // topo, nas telas que seguem o foco. Sem o cookie, nem consulta o banco;
  // erro aqui não derruba o app — a tela confere de novo (`ConferirFoco`) e a
  // trava das ações lê o foco por conta própria.
  const foco = await lerEmpresaEmFoco(ctx).catch((err) => {
    console.error("[layout] empresa em foco", err);
    return null;
  });

  return (
    <ToastProvider>
      {/* As cores dos grupos valem também aqui (21/10/2026): cada tela leva a
          do grupo dela (ver `grupoDaTelaDaEquipe`). A cor principal do
          escritório, só com "Usar também no Connect da equipe". */}
      <EstiloDaAparencia aparencia={aparencia.noConnect ? aparencia : { ...aparencia, corPrincipal: null }} />
      <AppShell
        faixaDoFoco={
          foco ? (
            <FaixaDoFoco foco={{ companyId: foco.companyId, nome: foco.nome, logoUrl: foco.logoUrl, alcance: alcanceDoFoco(foco) }} />
          ) : undefined
        }
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
        arquivosLigados={arquivosLigados}
        chamadosLigados={chamadosLigados}
        telasDoGeral={telasDoGeral}
        profileName={me?.name ?? "Usuário"}
        profileRoleLabel={ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
        profilePhotoUrl={me?.photoUrl ?? null}
        subscriptionReadOnly={ctx.subscriptionReadOnly}
        canSelfRegularizeSubscription={ctx.canSelfRegularizeSubscription}
        paresDeAjuda={PARES_DE_CAMINHO}
        menuRecolhidoInicial={menuRecolhidoDoCookie((await cookies()).get(COOKIE_DO_MENU_LATERAL)?.value)}
      >
        <SessionKeeper />
        <TutorialDaEquipe />
        <MeetingAlertOverlay />
        <AvisoDeVersaoNova />
        <DicaFlutuante />
        <ProvedorDoFoco companyId={foco?.companyId ?? null}>{children}</ProvedorDoFoco>
        {modal}
        <ChatDeIA agentes={agentesDoChatDeIA} nome={me?.name ?? ""} />
      </AppShell>
    </ToastProvider>
  );
}
