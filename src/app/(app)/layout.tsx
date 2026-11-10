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
import { getModuleRoute, MODULOS_DE_TODA_A_EQUIPE, MODULOS_DO_APOIO, MODULOS_FORA_DO_MENU, chamadosNoMenuDoSetor } from "@/lib/module-catalog";
import { semTelasDoGeralOcultas } from "@/lib/menuGeral";
import { telasDoGeralDaPessoa } from "@/lib/menuGeralDb";
import { baseDomain, hostSuffix, setoresDoSeletor } from "@/lib/auth/activeSector";
import { getAccessibleTenantIds } from "@/lib/auth/tenantAccess";
import { escritoriosDaTroca } from "@/lib/auth/trocaDeEscritorio";
import { ChatDeIA } from "@/components/shell/ChatDeIA";
import { agentesDoChat } from "@/lib/ia/chat/agentes";
import { PARES_DE_CAMINHO } from "@/lib/ajuda/artigos";
import { configDoHelpdesk } from "@/lib/chamados/contexto";
import { contarChamadosDoMenu, temAcessoAoModulo } from "@/lib/chamados/consultas";
import { telasDoMenuDoSetor } from "@/lib/telasDoMenuDoSetor";
import { lerOrdemDoMenuDoSetor } from "@/lib/menuDoSetorDb";
import { aparenciaDoEscritorio } from "@/lib/aparencia/leitura";
import { EstiloDaAparencia, EstiloDaPaleta } from "@/components/aparencia/EstiloDaAparencia";
import { lerEmpresaEmFoco, podeUsarOFoco } from "@/lib/empresas/focoServidor";
import { alcanceDoFoco } from "@/lib/empresas/foco";
import { FaixaDoFoco, ProvedorDoFoco } from "@/components/empresas/FaixaDoFoco";
import { contarNovasDaEquipe } from "@/lib/solicitacoes/consultas";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { podeAssistir } from "@/lib/robo/assistenciaServidor";
import { ChamadaDoRobo } from "@/components/robo/ChamadaDoRobo";

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
  // As leituras que não dependem umas das outras saem juntas (05/11/2026): o
  // layout ia ao banco umas 12 vezes em fila, em toda página. O estado dos
  // módulos é lido uma vez por requisição (`cache()` em `@/lib/modules`), por
  // mais que layout, página e gates o peçam.
  const prisma = getPrisma();
  // Só o contador do sino: a lista é buscada quando o sino abre (02/10/2026) —
  // vinda daqui, ela envelhecia, porque o layout não re-renderiza ao navegar.
  // Sem as arquivadas e os tipos ocultos (05/10/2026). Falha aqui não derruba
  // o app inteiro (deploy antes da migration, por exemplo): o sino fica sem número.
  const dono = { tenantId, userId: ctx.userId };
  const [
    { labels: sectorLabels, colors: sectorColors, options: sectorOptions },
    moduleStates,
    sectorsWithModules,
    helpdeskConfig,
    codigosFixados,
    agentesDoChatDeIA,
    unreadCount,
    me,
    accessibleTenants,
    { aparencia },
    foco,
    podeFocar,
    chamadaDoRobo,
  ] = await Promise.all([
    getSectorMaps(tenantId),
    getTenantModuleStates(tenantId),
    getSectorsWithEnabledModules(tenantId),
    configDoHelpdesk(tenantId),
    codigosDeTelasFixadas(ctx.userId, tenantId),
    // O chat de IA do canto da tela: a lista vazia (fora do piloto, nenhum
    // agente ligado, sem chave) é o que esconde o botão. Falha aqui não pode
    // derrubar o app — sem chat é o estado seguro.
    agentesDoChat(ctx).catch((err) => {
      console.error("[chat-ia] agentes do chat", err);
      return [];
    }),
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
    // A aparência do escritório (21/10/2026): as cores dos grupos de telas, e a
    // cor principal só se ele ligou "Usar também no Connect da equipe".
    aparenciaDoEscritorio(tenantId),
    // A empresa em foco (BPO, uma empresa por vez — 21/10/2026): a faixa do
    // topo, nas telas que seguem o foco. Sem o cookie, nem consulta o banco;
    // erro aqui não derruba o app — a tela confere de novo (`ConferirFoco`) e a
    // trava das ações lê o foco por conta própria.
    lerEmpresaEmFoco(ctx).catch((err) => {
      console.error("[layout] empresa em foco", err);
      return null;
    }),
    // Quem pode usar o foco vê a faixa, mesmo sem empresa (05/11/2026).
    podeUsarOFoco(ctx).catch((err) => {
      console.error("[layout] pode usar o foco", err);
      return false;
    }),
    // A janela do captcha do robô (09/11/2026) só monta para quem passa no
    // portão da tela do robô: quem não pode resolver nem pergunta ao servidor.
    ctx.userId
      ? podeAssistir(ctx).catch((err) => {
          console.error("[layout] janela do captcha do robô", err);
          return false;
        })
      : Promise.resolve(false),
  ]);
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
  const semMenu: ReadonlySet<string> = MODULOS_FORA_DO_MENU;
  // A fila das solicitações do portal mora no menu Geral (ver MODULOS_DO_MENU_GERAL).
  const solicitacoesLigadas = moduleStates.some((m) => m.code === "portal_solicitacoes" && m.enabled);
  // As solicitações novas (21/10/2026): o número do item Solicitações do menu.
  // O número dos Chamados (05/11/2026): o que pede ação de quem olha — ver `contarChamadosDoMenu`.
  const [telasDoGeral, chamadosLigados, solicitacoesNovas, chamadosNovos] = await Promise.all([
    telasDoGeralDaPessoa({ ...ctx, activeSector: activeSector?.code ?? null }),
    temAcessoAoModulo({ ctx, config: helpdeskConfig }),
    solicitacoesLigadas && ctx.userId
      ? contarNovasDaEquipe({ tenantId, setores: setoresDaFila(ctx), userId: ctx.userId }).catch((err) => {
          console.error("[layout] solicitações novas", err);
          return 0;
        })
      : Promise.resolve(0),
    contarChamadosDoMenu({ ctx, config: helpdeskConfig }).catch((err) => {
      console.error("[layout] chamados do menu", err);
      return 0;
    }),
  ]);
  // O Apoio do Geral (05/11/2026): Senhas e Manuais para todo setor, cada um
  // com os seus — quem pode agir em algum setor vê (a tela decide qual).
  const doApoio = (code: string) => moduleStates.some((m) => m.code === code && m.enabled) && ctx.role !== "READONLY";
  const apoioLigado = { senhas: doApoio("bpo_senhas"), manuais: doApoio("bpo_manual") };
  // A Academia (10/11/2026): de toda a equipe, inclusive o Somente leitura. O
  // chapéu de formatura do topo só aparece com o módulo ligado.
  const academiaLigada = moduleStates.some((m) => m.code === "academia" && m.enabled);
  const telasNavegaveis = semTelasDoGeralOcultas(
    moduleStates
      .filter((m) => m.enabled && !semMenu.has(m.code) && (m.code === "helpdesk" ? chamadosLigados : MODULOS_DE_TODA_A_EQUIPE.has(m.code) ? true : (MODULOS_DO_APOIO as readonly string[]).includes(m.code) ? ctx.role !== "READONLY" : canViewSector(ctx, m.sectorCodes)))
      .map((m) => ({
        code: m.code,
        label: m.label,
        href: getModuleRoute(m.code) ?? `/setor/${m.sectorCode}/${m.code}`,
        setor: sectorLabels[m.sectorCode] ?? m.sectorCode,
      })),
    telasDoGeral,
  );
  const arquivosLigados = moduleStates.some((m) => m.code === "arquivos" && m.enabled);
  // No setor que atende os chamados (a Tech), eles saem do Geral e entram no
  // menu do setor (26/10/2026, ver `chamadosNoMenuDoSetor`).
  const chamadosNoSetor = chamadosLigados && chamadosNoMenuDoSetor(activeSector?.code ?? null, helpdeskConfig.sectorCode);
  // As telas do setor, pela mesma regra da tela "Organizar menu" (`telasDoMenuDoSetor`),
  // e a ordem que o super admin escolheu para ele (05/11/2026).
  const activeSectorModules = activeSector ? telasDoMenuDoSetor(moduleStates, activeSector.code, { chamadosNoSetor, solicitacoesLigadas, semMenu }) : [];
  const ordemDoMenu = activeSector ? (await lerOrdemDoMenuDoSetor(tenantId, activeSector.code)).ordem : undefined;
  // Fixadas: a ordem é a que a pessoa escolheu, e o filtro é o que ela pode
  // abrir agora — fixada de módulo desligado depois continua guardada, só não
  // aparece (ver `telasFixadasVisiveis`).
  const telasFixadas = telasFixadasVisiveis(codigosFixados, telasNavegaveis);

  return (
    <ToastProvider>
      {/* As cores dos grupos valem também aqui (21/10/2026): cada tela leva a
          do grupo dela (ver `grupoDaTelaDaEquipe`). A cor principal do
          escritório, só com "Usar também no Connect da equipe". */}
      <EstiloDaAparencia aparencia={aparencia.noConnect ? aparencia : { ...aparencia, corPrincipal: null }} />
      {/* A paleta da pessoa (30/10/2026), por cima da cor do escritório. */}
      <EstiloDaPaleta cor={me?.accentColor ?? null} />
      {/* A faixa é o único lugar de escolher a empresa (05/11/2026): aparece
          para quem pode usar o foco, com ou sem empresa escolhida, e o
          provedor envolve o casco para o vazio de uma tela abrir a janela dela. */}
      <ProvedorDoFoco companyId={foco?.companyId ?? null} disponivel={podeFocar}>
      <AppShell
        faixaDoFoco={
          podeFocar ? (
            <FaixaDoFoco escritorio={tenantId} foco={foco ? { companyId: foco.companyId, nome: foco.nome, logoUrl: foco.logoUrl, matrizId: foco.matrizId, alcance: alcanceDoFoco(foco) } : null} />
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
        solicitacoesNovas={solicitacoesNovas}
        arquivosLigados={arquivosLigados}
        chamadosLigados={chamadosLigados && !chamadosNoSetor}
        chamadosNovos={chamadosLigados ? chamadosNovos : 0}
        apoioLigado={apoioLigado}
        academiaLigada={academiaLigada}
        ordemDoMenu={ordemDoMenu}
        podeOrganizarMenu={role === "SUPER_ADMIN"}
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
        {chamadaDoRobo && <ChamadaDoRobo />}
        <AvisoDeVersaoNova />
        <DicaFlutuante />
        {children}
        {modal}
        <ChatDeIA agentes={agentesDoChatDeIA} nome={me?.name ?? ""} />
      </AppShell>
      </ProvedorDoFoco>
    </ToastProvider>
  );
}
