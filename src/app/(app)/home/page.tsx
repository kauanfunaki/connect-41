import { Fragment, Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import {
  Building2,
  Clock,
  ArrowRightLeft,
  MessageSquareWarning,
  ChevronRight,
  Video,
  ExternalLink,
} from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { QuickCreateMenu } from "@/components/shared/QuickCreateMenu";
import { CustomizeHomeButton } from "@/components/home/CustomizeHomeButton";
import { HorizontalBarChart, TrendChart } from "@/components/shared/Charts";
import { numero } from "@/components/shared/Graficos";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, isFullWrite, isFullAccess } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getSectorsWithEnabledModules } from "@/lib/modules";
import { boardPath } from "@/lib/kanbanPaths";
import { formatCalendarDate, formatInstantDate, formatInstantTime } from "@/lib/format";
import { parseHomeWidgets, visibleWidgets, widgetsDisponiveis, type HomeWidgetKey } from "@/lib/homeWidgets";
import { acessoDosPaineis, type AcessoDoPainel } from "@/lib/home/acessoDosPaineis";
import { contarTarefas } from "@/lib/home/paineis";
import { precarregarHistoricoDaHome } from "@/lib/home/historico";
import { solicitacoesComRespostaAtrasada } from "@/lib/home/indicadores";
import { FaixaCarregando, FaixaDeDestaques, type SetorDoDestaque } from "@/components/home/FaixaDeDestaques";
import {
  PainelCarregando,
  PainelDeCertificados,
  PainelDeContas,
  PainelDePendencias,
  PainelDeProcessos,
  PainelDeRecrutamento,
  PainelDeSemanas,
  PainelDeTarefas,
  PainelDoDP,
} from "@/components/home/Paineis";
import { salvarWidgetsHome, restaurarWidgetsHome } from "./actions";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "adicionou uma nota em",
  STATUS_CHANGE: "moveu",
  DOCUMENT: "anexou um documento em",
  HANDOFF: "registrou uma transferência em",
  MENTION: "mencionou você em",
};

const PROVIDER_LABEL: Record<string, string> = { GOOGLE: "Google Meet", MICROSOFT: "MS Teams" };

function nowDate(): Date {
  return new Date();
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Tempo relativo curto pro feed de atividade — evita timestamp cru com segundos.
function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `há ${diffD}d`;
  return formatInstantDate(date, { day: "2-digit", month: "short" });
}

type DueBadgeInfo = { label: string; tom: TomDoSelo };

// Classifica prazo em badge semântico — vencido some silenciosamente na versão
// antiga (query só pegava dueDate >= hoje); aqui é o ponto central da tela.
function classifyDueDate(dueDate: Date | null, todayStart: Date, todayEnd: Date): DueBadgeInfo | null {
  if (!dueDate) return null;
  if (dueDate < todayStart) return { label: "Atrasada", tom: "perigo" };
  if (dueDate <= todayEnd) return { label: "Hoje", tom: "atencao" };
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  if (dueDate <= tomorrowEnd) return { label: "Amanhã", tom: "neutro" };
  return { label: formatCalendarDate(dueDate, { day: "2-digit", month: "short" }), tom: "neutro" };
}

function formatMeetingWhen(d: Date, todayStart: Date, todayEnd: Date): string {
  const time = formatInstantTime(d, { hour: "2-digit", minute: "2-digit" });
  if (d >= todayStart && d <= todayEnd) return `Hoje, ${time}`;
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  if (d >= tomorrowStart && d <= tomorrowEnd) return `Amanhã, ${time}`;
  return `${formatInstantDate(d, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${time}`;
}

export default async function HomePage() {
  const ctx = await getAuthContext();
  const canCreateCompany = canWrite(ctx.role);
  const canCreatePerson = canWrite(ctx.role);
  const canCreateTransfer = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const showWorkspaceOverview = isFullAccess(ctx.role) || ctx.role === "SECTOR_ADMIN";

  const prisma = getPrisma();
  const now = nowDate();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const fourteenDaysAgo = daysFromNow(-14);
  const monthStart = startOfMonth();

  const incomingHandoffWhere = isFullAccess(ctx.role)
    ? { tenantId: ctx.tenantId, sectors: { some: { status: "NEW" as const } } }
    : ctx.sectors.length > 0
      ? { tenantId: ctx.tenantId, sectors: { some: { status: "NEW" as const, sectorCode: { in: ctx.sectors } } } }
      : null;

  const [
    me,
    tenant,
    companyActiveCount,
    newCompaniesThisMonth,
    solicitacoesAtrasadas,
    pendingHandoffsCount,
    openPipelineItemsRaw,
    recentActivitiesRaw,
    activityCreatedDates,
    upcomingMeetings,
    incomingHandoffsRaw,
    homePreference,
  ] = await Promise.all([
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    prisma.company.count({ where: { ...(await scopedCompanyWhere(ctx)), status: "ACTIVE" } }),
    prisma.company.count({ where: { ...(await scopedCompanyWhere(ctx)), createdAt: { gte: monthStart } } }),
    // No lugar da contagem de pessoas (08/10, escolha 7A): ver `lib/home/indicadores`.
    solicitacoesComRespostaAtrasada(ctx, now),
    prisma.handoff.count({
      where: { AND: [scopedHandoffWhere(ctx), { sectors: { some: { status: { not: "DONE" } } } }] },
    }),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } },
      select: {
        id: true,
        entityId: true,
        entityType: true,
        title: true,
        dueDate: true,
        createdAt: true,
        pipelineId: true,
        stage: { select: { name: true, color: true } },
        pipeline: { select: { name: true, sectorCode: true } },
        assignees: { select: { userId: true } },
      },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipeline: scopedPipelineWhere(ctx) } },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        user: { select: { id: true, name: true } },
        pipelineItem: {
          select: { id: true, pipelineId: true, entityId: true, entityType: true, pipeline: { select: { sectorCode: true } } },
        },
      },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipeline: scopedPipelineWhere(ctx) }, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
    ctx.userId
      ? prisma.meeting.findMany({
          where: {
            tenantId: ctx.tenantId,
            startAt: { gte: now },
            OR: [{ createdByUserId: ctx.userId }, { attendees: { some: { userId: ctx.userId } } }],
          },
          orderBy: { startAt: "asc" },
          take: 4,
        })
      : Promise.resolve([]),
    incomingHandoffWhere
      ? prisma.handoff.findMany({
          where: incomingHandoffWhere,
          orderBy: { createdAt: "desc" },
          take: 4,
          include: {
            requester: { select: { name: true } },
            sectors: { select: { sectorCode: true }, orderBy: { createdAt: "asc" } },
          },
        })
      : Promise.resolve([]),
    // Leitura tolerante a falha de propósito: a Home é a primeira tela depois
    // do login e a tabela `user_preferences` só passa a existir depois do
    // `prisma db push`. Sem o catch, esquecer o push derrubaria a Home do time
    // inteiro por causa de uma preferência cosmética — assim ela só volta ao
    // layout padrão e o erro fica no log do servidor.
    ctx.userId
      ? prisma.userPreference
          .findUnique({ where: { userId: ctx.userId }, select: { homeWidgets: true } })
          .catch((err: unknown) => {
            console.error("[HomePage] preferência de widgets indisponível", err);
            return null;
          })
      : Promise.resolve(null),
  ]);

  const selectedWidgets = parseHomeWidgets(homePreference?.homeWidgets);

  // "Meu dia" — itens atribuídos a mim (qualquer prazo) unidos com todo item
  // com prazo definido no meu escopo (inclui vencidos, que a versão antiga
  // nunca mostrava porque a query só pegava dueDate >= hoje).
  const assignedToMe = ctx.userId
    ? openPipelineItemsRaw.filter((i) => i.assignees.some((a) => a.userId === ctx.userId))
    : [];
  const withDueDate = openPipelineItemsRaw.filter((i) => i.dueDate);
  const meuDiaMap = new Map<string, (typeof openPipelineItemsRaw)[number]>();
  for (const item of [...assignedToMe, ...withDueDate]) meuDiaMap.set(item.id, item);
  const meuDiaItems = Array.from(meuDiaMap.values())
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, 8);

  const vencidosCount = openPipelineItemsRaw.filter((i) => i.dueDate && i.dueDate < todayStart).length;
  const hojeCount = openPipelineItemsRaw.filter((i) => i.dueDate && i.dueDate >= todayStart && i.dueDate <= todayEnd).length;

  // Nomes das entidades referenciadas (Company ou Person) — item de "Meu dia",
  // atividade recente e transferências a revisar, tudo numa só rodada.
  const companyIds = new Set<string>();
  const personIds = new Set<string>();
  for (const i of meuDiaItems) {
    if (i.entityId) (i.entityType === "COMPANY" ? companyIds : personIds).add(i.entityId);
  }
  for (const a of recentActivitiesRaw) {
    if (a.pipelineItem.entityId) (a.pipelineItem.entityType === "COMPANY" ? companyIds : personIds).add(a.pipelineItem.entityId);
  }
  for (const h of incomingHandoffsRaw) (h.entityType === "COMPANY" ? companyIds : personIds).add(h.entityId);
  const [companiesNamed, peopleNamed] = await Promise.all([
    companyIds.size > 0
      ? prisma.company.findMany({ where: { id: { in: Array.from(companyIds) } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    personIds.size > 0
      ? prisma.person.findMany({ where: { id: { in: Array.from(personIds) } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const entityNames: Record<string, string> = {};
  companiesNamed.forEach((c) => (entityNames[c.id] = c.name));
  peopleNamed.forEach((p) => (entityNames[p.id] = p.name));

  // Feed de atividade agrupado — eventos consecutivos do mesmo autor/entidade
  // viram uma linha só ("fez N alterações"), em vez de N linhas idênticas.
  type ActivityGroup = {
    id: string;
    userName: string;
    entityId: string | null;
    pipelineId: string;
    pipelineSectorCode: string;
    pipelineItemId: string;
    label: string;
    count: number;
    createdAt: Date;
  };
  const activityGroups: ActivityGroup[] = [];
  for (const a of recentActivitiesRaw) {
    const last = activityGroups[activityGroups.length - 1];
    if (last && last.userName === a.user.name && last.entityId === a.pipelineItem.entityId) {
      last.count += 1;
    } else {
      activityGroups.push({
        id: a.id,
        userName: a.user.name,
        entityId: a.pipelineItem.entityId,
        pipelineId: a.pipelineItem.pipelineId,
        pipelineSectorCode: a.pipelineItem.pipeline.sectorCode,
        pipelineItemId: a.pipelineItem.id,
        label: ACTIVITY_LABEL[a.type] ?? "atualizou",
        count: 1,
        createdAt: a.createdAt,
      });
    }
    if (activityGroups.length >= 6) break;
  }

  // Widget "seus setores" — só setores com módulo habilitado; métrica agora é
  // volume de trabalho (abertos/vencidos), não "N módulos disponíveis".
  const [{ labels: sectorLabels, colors: sectorColors }, sectorsWithModules, paineis] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    getSectorsWithEnabledModules(ctx.tenantId),
    acessoDosPaineis(ctx),
  ]);
  // Com setor ativo, o widget mostra só ele — a Home do BPO não lista onze
  // setores dos quais dez não são dele.
  const visibleSectorCodes = (
    ctx.activeSector
      ? [ctx.activeSector]
      : isFullWrite(ctx.role) || ctx.role === "READONLY"
        ? Array.from(sectorsWithModules)
        : ctx.sectors
  ).filter((code) => sectorsWithModules.has(code));
  const sectorWidgets = visibleSectorCodes.map((code) => {
    const items = openPipelineItemsRaw.filter((i) => i.pipeline.sectorCode === code);
    return {
      code,
      label: sectorLabel(sectorLabels, code),
      color: sectorColors[code] ?? "#586577",
      openCount: items.length,
      overdueCount: items.filter((i) => i.dueDate && i.dueDate < todayStart).length,
    };
  });

  // Kanban por estágio + movimentações — únicos gráficos mantidos (visão do
  // workspace, só admin/coordenador); cortados os que tinham pouco sinal
  // (donut de 1 categoria, paleta arco-íris fora dos tokens).
  // Agrupa por (kanban, estágio) e mostra só os 5 maiores. Antes agrupava só
  // pelo NOME do estágio: "A Fazer" de dez quadros virava uma barra só (número
  // sem dono, impossível de agir em cima), e workspaces com muitos estágios
  // distintos viravam uma parede de barras. O nome do kanban vira sublabel pra
  // a barra dizer de onde veio.
  const STAGE_CHART_LIMIT = 5;
  const stageCounts = new Map<string, { label: string; sublabel: string; value: number; color: string }>();
  for (const item of openPipelineItemsRaw) {
    const key = `${item.pipelineId}::${item.stage.name}`;
    const prev = stageCounts.get(key);
    stageCounts.set(key, {
      label: item.stage.name,
      sublabel: item.pipeline.name,
      value: (prev?.value ?? 0) + 1,
      color: item.stage.color ?? "#586577",
    });
  }
  const stageChartAll = Array.from(stageCounts.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.value - a.value);
  const stageChartData = stageChartAll.slice(0, STAGE_CHART_LIMIT);
  const stageChartHiddenCount = stageChartAll.length - stageChartData.length;

  const dayBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = daysFromNow(-i);
    const key = formatInstantDate(d, { day: "2-digit", month: "2-digit" });
    dayBuckets.set(key, 0);
  }
  for (const a of activityCreatedDates) {
    const key = formatInstantDate(a.createdAt, { day: "2-digit", month: "2-digit" });
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const trendData = Array.from(dayBuckets.entries()).map(([label, value]) => ({ label, value }));

  const today = formatInstantDate(new Date(), { day: "2-digit", month: "long", year: "numeric" });
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? "";
  const pendingForMe = vencidosCount + hojeCount + incomingHandoffsRaw.length;
  const nextMeeting = upcomingMeetings[0] && upcomingMeetings[0].startAt <= todayEnd ? upcomingMeetings[0] : null;

  const restrictedOpts = { showRestricted: showWorkspaceOverview, paineisDoSetor: new Set(paineis.keys()) };
  const disponiveis = widgetsDisponiveis(restrictedOpts);
  const topWidgets = visibleWidgets("top", selectedWidgets, restrictedOpts);
  const painelWidgets = visibleWidgets("paineis", selectedWidgets, restrictedOpts);
  const abaixoDosPaineis = visibleWidgets("abaixo-dos-paineis", selectedWidgets, restrictedOpts);
  const mainWidgets = visibleWidgets("main", selectedWidgets, restrictedOpts);
  const sideWidgets = visibleWidgets("side", selectedWidgets, restrictedOpts);
  // Com uma das colunas vazia o grid de duas colunas jogaria a sobrevivente na
  // faixa larga (ou estreita) errada — nesse caso a Home vira coluna única.
  const twoColumns = mainWidgets.length > 0 && sideWidgets.length > 0;

  // Faixa de destaques (06/10): os números saem só dos painéis que estão na
  // Home desta pessoa — com acesso e não ocultos em "Personalizar". Painel
  // oculto não é consultado, nem pela faixa.
  const escopoDasTarefas = ctx.activeSector ? sectorLabel(sectorLabels, ctx.activeSector) : "Seus setores";
  const paineisNaHome = new Map<HomeWidgetKey, AcessoDoPainel>();
  const setoresDosDestaques: Partial<Record<HomeWidgetKey, SetorDoDestaque>> = {
    "painel-tarefas": {
      rotulo: escopoDasTarefas,
      cor: ctx.activeSector ? (sectorColors[ctx.activeSector] ?? "var(--c41-brand)") : "var(--c41-brand)",
    },
  };
  for (const chave of painelWidgets) {
    const acesso = paineis.get(chave);
    if (!acesso) continue;
    paineisNaHome.set(chave, acesso);
    setoresDosDestaques[chave] = { rotulo: sectorLabel(sectorLabels, acesso.setor), cor: sectorColors[acesso.setor] ?? "#586577" };
  }
  const tarefasNaHome = painelWidgets.includes("painel-tarefas");
  const contagemDasTarefas = contarTarefas(openPipelineItemsRaw, todayStart, todayEnd);
  const comDestaques = topWidgets.includes("destaques");
  // O histórico dos números (selo e linha, 06/10) começa a ser lido já, em
  // paralelo às consultas dos painéis — uma leitura só para todos eles.
  if (painelWidgets.length > 0) precarregarHistoricoDaHome(ctx);

  // Painéis de setor (30/09): cada um com a própria consulta, dentro de um
  // Suspense — a Home aparece sem esperar o mais lento, e o painel entra
  // quando o dado chega. Sem acesso, o painel nem é montado.
  function painelDoSetor(
    chave: HomeWidgetKey,
    Componente: (p: Parameters<typeof PainelDeContas>[0]) => Promise<React.ReactNode>
  ): React.ReactNode {
    const acesso = paineis.get(chave);
    if (!acesso) return null;
    const setor = { rotulo: sectorLabel(sectorLabels, acesso.setor), cor: sectorColors[acesso.setor] ?? "#586577" };
    return (
      <Suspense fallback={<PainelCarregando />}>
        <Componente ctx={ctx} acesso={acesso} setor={setor} />
      </Suspense>
    );
  }

  // Cada bloco da Home vira uma entrada deste mapa; o que entra na tela e em
  // que ordem é decidido logo abaixo por visibleWidgets(), a partir do que o
  // usuário escolheu em "Personalizar". Bloco sem dado (ex.: nenhuma reunião
  // hoje) continua sendo null como antes — a preferência só decide se ele
  // *pode* aparecer, não força um card vazio.
  const widgetNodes: Record<HomeWidgetKey, React.ReactNode> = {
    // Espera os painéis que resume — mas pelo `cache()` deles, sem consulta nova.
    destaques: (
      <Suspense fallback={<FaixaCarregando quantos={paineisNaHome.size + (tarefasNaHome ? 1 : 0)} />}>
        <FaixaDeDestaques
          ctx={ctx}
          paineis={paineisNaHome}
          tarefas={
            tarefasNaHome
              ? { atrasadas: contagemDasTarefas.atrasada, hoje: contagemDasTarefas.hoje, abertas: openPipelineItemsRaw.length }
              : undefined
          }
          setores={setoresDosDestaques}
        />
      </Suspense>
    ),

    // Em Suspense desde 06/10: o painel lê o histórico do número (selo e linha).
    "painel-tarefas": (
      <Suspense fallback={<PainelCarregando />}>
        <PainelDeTarefas
          ctx={ctx}
          itens={openPipelineItemsRaw}
          atribuidas={assignedToMe.length}
          escopo={escopoDasTarefas}
          inicioDeHoje={todayStart}
          fimDeHoje={todayEnd}
        />
      </Suspense>
    ),
    "painel-contas": painelDoSetor("painel-contas", PainelDeContas),
    "painel-semanas": painelDoSetor("painel-semanas", PainelDeSemanas),
    "painel-pendencias": painelDoSetor("painel-pendencias", PainelDePendencias),
    "painel-processos": painelDoSetor("painel-processos", PainelDeProcessos),
    "painel-dp": painelDoSetor("painel-dp", PainelDoDP),
    "painel-recrutamento": painelDoSetor("painel-recrutamento", PainelDeRecrutamento),
    "painel-certificados": painelDoSetor("painel-certificados", PainelDeCertificados),

    // Abaixo dos painéis desde 08/10 (escolha 7A do Kauan): a faixa de
    // destaques abre a tela, e isto é o resumo de consulta. Sem o canal de
    // solicitações do portal, o quarto cartão não existe e a grade fica em três.
    indicadores: (
      <div
        className={`grid grid-cols-2 gap-3 mb-4 ${
          solicitacoesAtrasadas
            ? "sm:grid-cols-4"
            : "sm:grid-cols-3 [&>:nth-child(3)]:col-span-2 sm:[&>:nth-child(3)]:col-span-1"
        }`}
      >
        {/* O MetricCard formata o número em pt-BR (1.234). "Atrasadas", e não
            "vencidos" (07/10): é o termo do painel de tarefas e da faixa para o
            mesmo número — e a mesma cor: vermelho quando há atrasada, âmbar
            quando só há as de hoje, como na faixa e no painel. */}
        <MetricCard
          href="/empresas"
          icon={<Building2 size={16} />}
          label="Empresas ativas"
          value={companyActiveCount}
          delay={0}
          sub={newCompaniesThisMonth > 0 ? `+${numero(newCompaniesThisMonth)} este mês` : undefined}
        />
        <MetricCard
          href="/kanban"
          icon={<Clock size={16} />}
          label="Atrasadas / hoje"
          value={vencidosCount + hojeCount}
          delay={40}
          tom={vencidosCount > 0 ? "critico" : hojeCount > 0 ? "atencao" : undefined}
          sub={vencidosCount > 0 ? `${numero(vencidosCount)} atrasada${vencidosCount !== 1 ? "s" : ""}` : undefined}
        />
        <MetricCard
          href="/transferencias?status=NEW"
          icon={<ArrowRightLeft size={16} />}
          label="Transferências"
          value={pendingHandoffsCount}
          delay={80}
          highlight={pendingHandoffsCount > 0}
          sub={pendingHandoffsCount > 0 ? "em aberto" : undefined}
        />
        {/* No lugar de "Pessoas cadastradas" (08/10, escolha 7A): um número
            que pede ação — o cliente esperando a primeira resposta da equipe
            além do prazo prometido. O porquê da escolha está em
            `lib/home/indicadores`. Leva à fila no recorte "resposta atrasada". */}
        {solicitacoesAtrasadas && (
          <MetricCard
            href={solicitacoesAtrasadas.href}
            icon={<MessageSquareWarning size={16} />}
            label="Solicitações atrasadas"
            value={solicitacoesAtrasadas.quantas}
            delay={120}
            tom={solicitacoesAtrasadas.quantas > 0 ? "critico" : undefined}
            sub={solicitacoesAtrasadas.quantas > 0 ? "sem resposta no prazo" : undefined}
          />
        )}
      </div>
    ),

    "proxima-reuniao": nextMeeting && (
      <div className="flex items-center justify-between gap-3 bg-brand-subtle border border-brand/20 rounded-lg px-4 py-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <Video size={16} className="text-brand flex-shrink-0" />
          <p className="text-body text-fg truncate">
            <span className="font-medium">{nextMeeting.title}</span>
            <span className="text-fg-muted">
              {" · "}
              {formatMeetingWhen(nextMeeting.startAt, todayStart, todayEnd)}
              {" · "}
              {PROVIDER_LABEL[nextMeeting.provider] ?? nextMeeting.provider}
            </span>
          </p>
        </div>
        {/* `nativo`: a sala é endereço de fora do app (Meet/Teams). */}
        <Button href={nextMeeting.meetingUrl} nativo target="_blank" rel="noopener noreferrer" size="sm" className="flex-shrink-0">
          Entrar <ExternalLink size={12} />
        </Button>
      </div>
    ),

    "meu-dia": (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Meu dia</h2>
        {meuDiaItems.length === 0 ? (
          <p className="text-body text-fg-muted">Nenhum item com prazo ou atribuído a você.</p>
        ) : (
          <div className="space-y-1">
            {meuDiaItems.map((item) => {
              const badge = classifyDueDate(item.dueDate, todayStart, todayEnd);
              return (
                <Link
                  key={item.id}
                  href={`${boardPath({ id: item.pipelineId })}/itens/${item.id}`}
                  className="flex items-center justify-between gap-3 py-2 group"
                >
                  <span className="text-body text-fg group-hover:text-brand transition-colors truncate min-w-0">
                    {item.title ?? (item.entityId ? entityNames[item.entityId] : null) ?? "(sem título)"}
                    <span className="text-fg-muted font-normal">
                      {" · "}
                      {sectorLabels[item.pipeline.sectorCode] ?? item.pipeline.sectorCode}
                      {" · "}
                      {item.stage.name}
                    </span>
                  </span>
                  {badge ? (
                    <Selo tom={badge.tom} className="flex-shrink-0">
                      {badge.label}
                    </Selo>
                  ) : (
                    <span className="flex-shrink-0 text-helper text-fg-muted">Sem prazo</span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    ),

    transferencias: (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Transferências a revisar</h2>
        {incomingHandoffsRaw.length === 0 ? (
          <p className="text-body text-fg-muted">Nenhuma transferência aguardando o seu setor.</p>
        ) : (
          <div className="space-y-3">
            {incomingHandoffsRaw.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-3">
                <p className="text-body text-fg truncate min-w-0">
                  {sectorLabels[h.fromSector] ?? h.fromSector} →{" "}
                  {h.sectors.map((s) => sectorLabels[s.sectorCode] ?? s.sectorCode).join(", ")}
                  {" · "}
                  <span className="font-medium">{entityNames[h.entityId] ?? "(removido)"}</span>
                  <span className="text-fg-muted">{" · "}{h.requester.name} · {formatRelativeTime(h.createdAt)}</span>
                </p>
                <Button href={`/transferencias/${h.id}`} variant="secondary" size="xs" className="flex-shrink-0">
                  Revisar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    ),

    workspace: (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Visão do workspace</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="text-fs-1 font-medium text-fg-muted uppercase tracking-wide mb-2.5">
              Top {STAGE_CHART_LIMIT} · cards por estágio
            </p>
            <HorizontalBarChart data={stageChartData} emptyLabel="Nenhum card em aberto nos seus kanbans." />
            {stageChartHiddenCount > 0 && (
              <p className="text-fs-1 text-fg-muted mt-2.5">
                + {stageChartHiddenCount} outro{stageChartHiddenCount !== 1 ? "s" : ""} estágio
                {stageChartHiddenCount !== 1 ? "s" : ""} com menos cards
              </p>
            )}
          </div>
          <div>
            <p className="text-fs-1 font-medium text-fg-muted uppercase tracking-wide mb-2.5">Movimentações (14 dias)</p>
            <TrendChart data={trendData} />
          </div>
        </div>
      </div>
    ),

    agenda: (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Agenda</h2>
        {upcomingMeetings.length === 0 ? (
          <p className="text-body text-fg-muted">Nenhuma reunião agendada.</p>
        ) : (
          <div className="space-y-2.5">
            {upcomingMeetings.map((m) => (
              <a
                key={m.id}
                href={m.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2 group"
              >
                <span className="text-body text-fg group-hover:text-brand transition-colors truncate min-w-0">
                  {m.title}
                </span>
                <span className="text-helper text-fg-muted tnum flex-shrink-0">
                  {formatMeetingWhen(m.startAt, todayStart, todayEnd)}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    ),

    atividade: (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Atividade</h2>
        {activityGroups.length === 0 ? (
          <p className="text-body text-fg-muted">Nenhuma atividade registrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {activityGroups.map((g) => (
              <Link key={g.id} href={`${boardPath({ id: g.pipelineId })}/itens/${g.pipelineItemId}`} className="flex items-start gap-2.5 group">
                <span className="w-6 h-6 rounded-full bg-brand-subtle text-brand text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {g.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-body text-fg-secondary leading-snug">
                    <span className="font-medium text-fg group-hover:text-brand transition-colors">{g.userName}</span>{" "}
                    {g.count > 1 ? (
                      `fez ${g.count} alterações em `
                    ) : (
                      `${g.label} `
                    )}
                    <span className="font-medium">{(g.entityId ? entityNames[g.entityId] : null) ?? "(tarefa)"}</span>
                  </p>
                  <p className="text-helper text-fg-muted">{formatRelativeTime(g.createdAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    ),

    setores: sectorWidgets.length > 0 && (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">
          {sectorWidgets.length > 1 ? "Seus setores" : "Seu setor"}
        </h2>
        <div className="flex flex-col gap-2">
          {sectorWidgets.map((s) => (
            <Link
              key={s.code}
              href={`/setor/${s.code}`}
              className="group flex items-center justify-between gap-2 bg-surface-hover border border-border rounded-lg px-3.5 py-2.5 hover:border-border-strong transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <div className="min-w-0">
                  <p className="text-fs-3 font-medium text-fg truncate">{s.label}</p>
                  <p className="text-fs-1 text-fg-muted">
                    {s.openCount} aberto{s.openCount !== 1 ? "s" : ""}
                    {s.overdueCount > 0 && <span className="text-danger"> · {s.overdueCount} atrasado{s.overdueCount !== 1 ? "s" : ""}</span>}
                  </p>
                </div>
              </div>
              <ChevronRight size={15} className="text-fg-muted flex-shrink-0 group-hover:text-fg transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title={firstName ? `Olá, ${firstName}` : "Início"}
        subtitle={<>{pendingForMe > 0
              ? `${pendingForMe} pendência${pendingForMe !== 1 ? "s" : ""} precisa${pendingForMe !== 1 ? "m" : ""} de você`
              : <>Aqui está um resumo do workspace {tenant?.name ? <span className="text-fg font-medium">{tenant.name}</span> : ""}</>}</>}
        action={
          <div className="flex items-center gap-3">
            <p className="hidden sm:block text-helper text-fg-muted tnum">{today}</p>
            <CustomizeHomeButton
              selected={selectedWidgets}
              disponiveis={disponiveis}
              saveAction={salvarWidgetsHome}
              resetAction={restaurarWidgetsHome}
            />
            <QuickCreateMenu
              canCreateCompany={canCreateCompany}
              canCreatePerson={canCreatePerson}
              canCreateTransfer={canCreateTransfer}
            />
          </div>
        }
      />

      {topWidgets.map((key) => (
        <Fragment key={key}>{widgetNodes[key]}</Fragment>
      ))}

      {/* Painéis: a grade de gráficos (30/09). Duas colunas até telas bem
          largas — com a sidebar, três painéis a 1440px apertam as barras.
          Com a faixa de destaques em cima (06/10), os gráficos ficam mais
          baixos: o número que manda já está na faixa. */}
      {painelWidgets.length > 0 && (
        <div
          data-compacto={comDestaques ? "true" : undefined}
          className="group/grade grid grid-cols-1 lg:grid-cols-2 min-[1760px]:grid-cols-3 gap-4 mb-4 items-stretch"
        >
          {painelWidgets.map((key) => (
            <Fragment key={key}>{widgetNodes[key]}</Fragment>
          ))}
        </div>
      )}

      {/* Entre os painéis e as colunas: os Indicadores (08/10, escolha 7A). */}
      {abaixoDosPaineis.map((key) => (
        <Fragment key={key}>{widgetNodes[key]}</Fragment>
      ))}

      {/* Corpo: coluna principal (meu trabalho) + coluna lateral */}
      {(mainWidgets.length > 0 || sideWidgets.length > 0) && (
        <div className={`grid gap-4 ${twoColumns ? "grid-cols-1 lg:grid-cols-[1.7fr_1fr]" : "grid-cols-1"}`}>
          {mainWidgets.length > 0 && (
            <div className="flex flex-col gap-4 min-w-0">
              {mainWidgets.map((key) => (
                <Fragment key={key}>{widgetNodes[key]}</Fragment>
              ))}
            </div>
          )}

          {sideWidgets.length > 0 && (
            <div className="flex flex-col gap-4 min-w-0">
              {sideWidgets.map((key) => (
                <Fragment key={key}>{widgetNodes[key]}</Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      {topWidgets.length === 0 &&
        painelWidgets.length === 0 &&
        abaixoDosPaineis.length === 0 &&
        mainWidgets.length === 0 &&
        sideWidgets.length === 0 && (
        <p className="text-body text-fg-muted">
          Todos os blocos estão ocultos. Use <span className="text-fg font-medium">Personalizar</span> para trazer algum de volta.
        </p>
      )}
    </PageContainer>
  );
}

