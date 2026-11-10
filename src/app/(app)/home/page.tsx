import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Video, ExternalLink } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo, type TomDoSelo } from "@/components/ui/Selo";
import { QuickCreateMenu } from "@/components/shared/QuickCreateMenu";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { InicioEditavel, type LayoutDoInicio } from "@/components/home/InicioEditavel";
import { CartoesDoTopo } from "@/components/home/CartoesDoTopo";
import { FaixaDeCartoesCarregando } from "@/components/home/FaixaDeCartoes";
import { HorizontalBarChart, TrendChart } from "@/components/shared/Charts";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, isFullWrite, isFullAccess } from "@/lib/auth/context";
import { scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { abasVisiveis, quemVeAsTransferencias, whereDaAba } from "@/lib/handoffAbas";
import { assuntoDaTransferencia, SEM_ASSUNTO } from "@/lib/handoffs";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getSectorsWithEnabledModules } from "@/lib/modules";
import { enderecoDaTarefa, enderecoDe } from "@/lib/enderecoCurto";
import { formatCalendarDate, formatInstantDate, formatInstantTime } from "@/lib/format";
import { HOME_WIDGETS, parseHomeWidgets, visibleWidgets, widgetsDisponiveis, type HomeWidgetKey } from "@/lib/homeWidgets";
import { acessoDosPaineis } from "@/lib/home/acessoDosPaineis";
import { precarregarHistoricoDaHome } from "@/lib/home/historico";
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

  // O painel "Transferências para o seu setor" é a aba "Para o meu setor" da
  // lista, com o mesmo filtro (10/11/2026, pedido do Kauan) — e o cartão
  // "Transferências para o meu setor" do topo conta o mesmo (`cartoesServidor`).
  // Sem caixa de setor (quem não é de setor nenhum), fica vazio.
  const quemVe = quemVeAsTransferencias(ctx);
  const incomingHandoffWhere = abasVisiveis(quemVe).includes("setor")
    ? { AND: [scopedHandoffWhere(ctx), whereDaAba("setor", quemVe)] }
    : null;

  // Os números dos cartões do topo (empresas ativas, solicitações atrasadas,
  // transferências…) saíram daqui em 10/11/2026: cada cartão conta o seu, e só
  // os quatro que a pessoa tem no topo (`components/home/CartoesDoTopo`).
  const [
    me,
    tenant,
    openPipelineItemsRaw,
    recentActivitiesRaw,
    activityCreatedDates,
    upcomingMeetings,
    incomingHandoffsRaw,
    homePreference,
  ] = await Promise.all([
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } },
      select: {
        id: true,
        number: true,
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
          select: { id: true, number: true, pipelineId: true, entityId: true, entityType: true, pipeline: { select: { sectorCode: true } } },
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
  // As atrasadas por setor, da mesma lista: os cartões "Tarefas atrasadas" do
  // Fiscal e do Contábil (10/11/2026) não contam de novo no banco.
  const atrasadasPorSetor: Record<string, number> = {};
  for (const i of openPipelineItemsRaw) {
    if (i.dueDate && i.dueDate < todayStart) atrasadasPorSetor[i.pipeline.sectorCode] = (atrasadasPorSetor[i.pipeline.sectorCode] ?? 0) + 1;
  }

  // Nomes das entidades referenciadas (Company ou Person) — item de "Meu dia",
  // atividade recente e transferências para o setor, tudo numa só rodada.
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
    pipelineItemNumber: number;
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
        pipelineItemNumber: a.pipelineItem.number,
        label: ACTIVITY_LABEL[a.type] ?? "atualizou",
        count: 1,
        createdAt: a.createdAt,
      });
    }
    if (activityGroups.length >= 6) break;
  }

  // Widget "seus setores" — só setores com módulo habilitado; métrica agora é
  // volume de trabalho (abertos/vencidos), não "N módulos disponíveis".
  const [{ labels: sectorLabels, colors: sectorColors, options: sectorOptions }, sectorsWithModules, paineis] = await Promise.all([
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
  const mainWidgets = visibleWidgets("main", selectedWidgets, restrictedOpts);
  const sideWidgets = visibleWidgets("side", selectedWidgets, restrictedOpts);
  const escopoDasTarefas = ctx.activeSector ? sectorLabel(sectorLabels, ctx.activeSector) : "Seus setores";
  // O histórico dos números (selo e linha, 06/10) começa a ser lido já, em
  // paralelo às consultas dos painéis — uma leitura só para eles e para os
  // cartões do topo, que sempre estão na tela (10/11/2026).
  precarregarHistoricoDaHome(ctx);

  // Os quatro cartões coringa do topo (10/11/2026, pedido do Kauan): no lugar
  // da faixa "Destaques" e dos "Indicadores". Ficam fora do "Personalizar" —
  // cada um se troca pelo lápis dele — e entram por último, sem atrasar a tela.
  const cartoesDoTopo = (
    <Suspense fallback={<FaixaDeCartoesCarregando />}>
      <CartoesDoTopo
        ctx={ctx}
        previos={{ tarefas: { atrasadas: vencidosCount, hoje: hojeCount, atrasadasPorSetor } }}
        setores={sectorOptions.map((s) => ({ code: s.value, label: s.label }))}
        setorAtivoRotulo={ctx.activeSector ? sectorLabel(sectorLabels, ctx.activeSector) : null}
      />
    </Suspense>
  );

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
          <p className="text-body text-fg-muted">Nenhuma atividade com prazo ou atribuída a você.</p>
        ) : (
          <div className="space-y-1">
            {meuDiaItems.map((item) => {
              const badge = classifyDueDate(item.dueDate, todayStart, todayEnd);
              return (
                <Link
                  key={item.id}
                  href={enderecoDaTarefa(item.pipelineId, item)}
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
        {/* As quatro mais recentes da aba "Para o meu setor" (10/11/2026): o
            título diz o que é, e o botão "Abrir" diz o que faz — "Revisar"
            prometia uma ação que a tela não tem. */}
        <h2 className="text-section font-semibold text-fg mb-3.5">Transferências para o seu setor</h2>
        {incomingHandoffsRaw.length === 0 ? (
          <p className="text-body text-fg-muted">Nenhuma transferência aguardando o seu setor.</p>
        ) : (
          <div className="space-y-3">
            {incomingHandoffsRaw.map((h) => {
              const assunto = assuntoDaTransferencia(h);
              return (
                <div key={h.id} className="flex items-center justify-between gap-3">
                  <p className="text-body text-fg truncate min-w-0">
                    <span className={assunto ? "font-medium" : "text-fg-muted"}>{assunto ?? SEM_ASSUNTO}</span>
                    {" · "}
                    {entityNames[h.entityId] ?? "(removido)"}
                    <span className="text-fg-muted">
                      {" · "}
                      {sectorLabel(sectorLabels, h.fromSector)} →{" "}
                      {h.sectors.map((s) => sectorLabel(sectorLabels, s.sectorCode)).join(", ")}
                      {" · "}
                      {formatRelativeTime(h.createdAt)}
                    </span>
                  </p>
                  <Button href={enderecoDe("transferencia", h)} variant="secondary" size="xs" className="flex-shrink-0">
                    Abrir
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),

    workspace: (
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5">
        <h2 className="text-section font-semibold text-fg mb-3.5">Visão do workspace</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <p className="c41-rotulo mb-2.5">
              Top {STAGE_CHART_LIMIT} · tarefas por estágio
            </p>
            <HorizontalBarChart data={stageChartData} emptyLabel="Nenhuma atividade em aberto nos seus Quadros." />
            {stageChartHiddenCount > 0 && (
              <p className="text-fs-1 text-fg-muted mt-2.5">
                + {stageChartHiddenCount} outro{stageChartHiddenCount !== 1 ? "s" : ""} estágio
                {stageChartHiddenCount !== 1 ? "s" : ""} com menos tarefas
              </p>
            )}
          </div>
          <div>
            <p className="c41-rotulo mb-2.5">Movimentações (14 dias)</p>
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
              <Link key={g.id} href={enderecoDaTarefa(g.pipelineId, { id: g.pipelineItemId, number: g.pipelineItemNumber })} className="flex items-start gap-2.5 group">
                <AvatarImage src={null} name={g.userName} size={24} bordered={false} fontSize={11} className="mt-0.5" />
                <div className="min-w-0">
                  <p className="text-body text-fg-secondary leading-snug">
                    <span className="font-medium text-fg group-hover:text-brand transition-colors">{g.userName}</span>{" "}
                    {g.count > 1 ? (
                      `fez ${g.count} alterações em `
                    ) : (
                      `${g.label} `
                    )}
                    <span className="font-medium">{(g.entityId ? entityNames[g.entityId] : null) ?? "(atividade)"}</span>
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
            // O cartão-atalho do app (`Card href`): borda azul, sobe 2px.
            <Card
              key={s.code}
              href={`/setor/${s.code}`}
              className="group flex items-center justify-between gap-2 px-3.5 py-2.5"
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
            </Card>
          ))}
        </div>
      </div>
    ),
  };

  // Os visíveis de cada faixa vão prontos para o Início, que liga a edição
  // na própria tela (escolha 11A dos Ajustes de 15/10, 20/10/2026). Só os
  // visíveis são montados: o escondido nem consulta o banco.
  const layout: LayoutDoInicio = {
    top: topWidgets,
    paineis: painelWidgets,
    main: mainWidgets,
    side: sideWidgets,
  };
  const nos = Object.fromEntries(
    Object.values(layout)
      .flat()
      .map((key) => [key, widgetNodes[key] || null])
  ) as Partial<Record<HomeWidgetKey, React.ReactNode>>;

  return (
    <PageContainer>
      <InicioEditavel
        key={JSON.stringify(layout)}
        titulo={firstName ? `Olá, ${firstName}` : "Início"}
        subtitulo={<>{pendingForMe > 0
              ? `${pendingForMe} pendência${pendingForMe !== 1 ? "s" : ""} precisa${pendingForMe !== 1 ? "m" : ""} de você`
              : <>Aqui está um resumo do workspace {tenant?.name ? <span className="text-fg font-medium">{tenant.name}</span> : ""}</>}</>}
        data={today}
        criar={
          <QuickCreateMenu
            canCreateCompany={canCreateCompany}
            canCreatePerson={canCreatePerson}
            canCreateTransfer={canCreateTransfer}
          />
        }
        cartoes={cartoesDoTopo}
        layout={layout}
        nos={nos}
        disponiveis={HOME_WIDGETS.filter((w) => disponiveis.includes(w.key)).map((w) => ({ key: w.key, rotulo: w.label, faixa: w.slot }))}
        salvar={salvarWidgetsHome}
        restaurar={restaurarWidgetsHome}
      />
    </PageContainer>
  );
}

