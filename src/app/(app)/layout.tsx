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
import { getModuleRoute, MODULOS_DO_MENU_GERAL, FORA_DO_MENU_COM_SOLICITACOES, MODULOS_FORA_DO_MENU, MODULOS_SEM_MENU, chamadosNoMenuDoSetor } from "@/lib/module-catalog";
import { bancoFiscalLocal } from "@/lib/fiscal/local/ambiente";
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
import { EstiloDaAparencia, EstiloDaPaleta } from "@/components/aparencia/EstiloDaAparencia";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { alcanceDoFoco } from "@/lib/empresas/foco";
import { FaixaDoFoco, ProvedorDoFoco } from "@/components/empresas/FaixaDoFoco";
import { contarNovasDaEquipe } from "@/lib/solicitacoes/consultas";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";

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
  // Documentos fiscais sai do menu só onde a prévia do SPED abre (o banco
  // fiscal local): ali o caminho é o Acervo. Em produção a prévia mostra
  // "Processamento fiscal indisponível", e sem esta exceção a tela ficava sem
  // entrada nenhuma (21/10/2026).
  const semMenu: ReadonlySet<string> = new Set([...MODULOS_FORA_DO_MENU, ...(bancoFiscalLocal() ? MODULOS_SEM_MENU : [])]);
  const [moduleStates, telasDoGeral] = await Promise.all([
    getTenantModuleStates(tenantId),
    telasDoGeralDaPessoa({ ...ctx, activeSector: activeSector?.code ?? null }),
  ]);
  const helpdeskConfig = await configDoHelpdesk(tenantId);
  const chamadosLigados = await temAcessoAoModulo({ ctx, config: helpdeskConfig });
  const telasNavegaveis = semTelasDoGeralOcultas(
    moduleStates
      .filter((m) => m.enabled && !semMenu.has(m.code) && (m.code === "helpdesk" ? chamadosLigados : canViewSector(ctx, m.sectorCodes)))
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
  // No setor que atende os chamados (a Tech), eles saem do Geral e entram no
  // menu do setor (26/10/2026, ver `chamadosNoMenuDoSetor`).
  const chamadosNoSetor = chamadosLigados && chamadosNoMenuDoSetor(activeSector?.code ?? null, helpdeskConfig.sectorCode);
  const activeSectorModules = activeSector
    ? moduleStates
        // Com as Solicitações ligadas, o grupo Cliente do BPO sai do menu do
        // setor: Pendências e Aprovações moram nas abas delas, e a Conversa
        // repetia o item Solicitações do Geral (21/10/2026).
        .filter((m) => m.enabled && m.sectorCodes.includes(activeSector.code) && (!MODULOS_DO_MENU_GERAL.has(m.code) || (m.code === "helpdesk" && chamadosNoSetor)) && !semMenu.has(m.code) && !(solicitacoesLigadas && FORA_DO_MENU_COM_SOLICITACOES.has(m.code)))
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
  // A aparência do escritório (21/10/2026): as cores dos grupos de telas, e a
  // cor principal só se ele ligou "Usar também no Connect da equipe".
  // As solicitações novas (21/10/2026): o número do item Solicitações do menu.
  const [unreadCount, me, accessibleTenants, { aparencia }, solicitacoesNovas] = await Promise.all([
    ctx.userId
      ? tiposOcultos(dono)
          .then((ocultos) => contarNaoLidasVisiveis(dono, ocultos))
          .catch((err) => {
            console.error("[layout] contador do sino", err);
            return 0;
          })
      : Promise.resolve(0),
    ctx.userId
      ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true, photoUrl: true, accentColor: true } })
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
    solicitacoesLigadas && ctx.userId
      ? contarNovasDaEquipe({ tenantId, setores: setoresDaFila(ctx), userId: ctx.userId }).catch((err) => {
          console.error("[layout] solicitações novas", err);
          return 0;
        })
      : Promise.resolve(0),
  ]);

  // A empresa em foco (BPO, uma empresa por vez — 21/10/2026): a faixa do
  // topo, nas telas que seguem o foco. Sem o cookie, nem consulta o banco;
  // erro aqui não derruba o app — a tela confere de novo (`ConferirFoco`) e a
  // trava das ações lê o foco por conta própria.
  const [foco, podeFocar] = await Promise.all([
    lerEmpresaEmFoco(ctx).catch((err) => {
      console.error("[layout] empresa em foco", err);
      return null;
    }),
    // O seletor do topo escolhe a empresa (29/10/2026): para quem usa o foco.
    podeUsarOFoco(ctx).catch((err) => {
      console.error("[layout] pode usar o foco", err);
      return false;
    }),
  ]);

  return (
    <ToastProvider>
      {/* As cores dos grupos valem também aqui (21/10/2026): cada tela leva a
          do grupo dela (ver `grupoDaTelaDaEquipe`). A cor principal do
          escritório, só com "Usar também no Connect da equipe". */}
      <EstiloDaAparencia aparencia={aparencia.noConnect ? aparencia : { ...aparencia, corPrincipal: null }} />
      {/* A paleta da pessoa (30/10/2026), por cima da cor do escritório. */}
      <EstiloDaPaleta cor={me?.accentColor ?? null} />
      <AppShell
        faixaDoFoco={
          foco ? (
            <FaixaDoFoco foco={{ companyId: foco.companyId, nome: foco.nome, logoUrl: foco.logoUrl, alcance: alcanceDoFoco(foco) }} />
          ) : undefined
        }
        foco={podeFocar ? { atual: foco ? { companyId: foco.companyId, nome: foco.nome } : null } : null}
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
        solicitacoesNovas={solicitacoesNovas}
        arquivosLigados={arquivosLigados}
        chamadosLigados={chamadosLigados && !chamadosNoSetor}
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
