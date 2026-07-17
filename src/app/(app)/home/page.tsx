import Link from "next/link";
import {
  Building2,
  Users,
  Clock,
  ArrowRightLeft,
  ChevronRight,
  Video,
  ExternalLink,
} from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { QuickCreateMenu } from "@/components/shared/QuickCreateMenu";
import { HorizontalBarChart, TrendChart } from "@/components/shared/Charts";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, isFullWrite, isFullAccess } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getSectorsWithEnabledModules } from "@/lib/modules";
import { formatCalendarDate, formatInstantDate, formatInstantTime } from "@/lib/format";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "adicionou uma nota em",
  STATUS_CHANGE: "moveu",
  DOCUMENT: "anexou um documento em",
  HANDOFF: "registrou um handoff em",
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

type DueBadgeInfo = { label: string; className: string };

// Classifica prazo em badge semântico — vencido some silenciosamente na versão
// antiga (query só pegava dueDate >= hoje); aqui é o ponto central da tela.
function classifyDueDate(dueDate: Date | null, todayStart: Date, todayEnd: Date): DueBadgeInfo | null {
  if (!dueDate) return null;
  if (dueDate < todayStart) return { label: "Vencido", className: "bg-danger-bg text-danger" };
  if (dueDate <= todayEnd) return { label: "Hoje", className: "bg-warning-bg text-warning" };
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  if (dueDate <= tomorrowEnd) return { label: "Amanhã", className: "bg-surface-2 text-fg-secondary" };
  return {
    label: formatCalendarDate(dueDate, { day: "2-digit", month: "short" }),
    className: "bg-surface-2 text-fg-muted",
  };
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
    personCount,
    pendingHandoffsCount,
    openPipelineItemsRaw,
    recentActivitiesRaw,
    activityCreatedDates,
    upcomingMeetings,
    incomingHandoffsRaw,
  ] = await Promise.all([
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    prisma.company.count({ where: { ...(await scopedCompanyWhere(ctx)), status: "ACTIVE" } }),
    prisma.company.count({ where: { ...(await scopedCompanyWhere(ctx)), createdAt: { gte: monthStart } } }),
    prisma.person.count({ where: { ...(await scopedPersonWhere(ctx)), type: "COLABORADOR" } }),
    prisma.handoff.count({
      where: { AND: [scopedHandoffWhere(ctx), { sectors: { some: { status: { not: "DONE" } } } }] },
    }),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } },
      select: {
        id: true,
        entityId: true,
        entityType: true,
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
        pipelineItem: { select: { id: true, pipelineId: true, entityId: true, entityType: true } },
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
  ]);

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
  for (const i of meuDiaItems) (i.entityType === "COMPANY" ? companyIds : personIds).add(i.entityId);
  for (const a of recentActivitiesRaw) (a.pipelineItem.entityType === "COMPANY" ? companyIds : personIds).add(a.pipelineItem.entityId);
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
    entityId: string;
    pipelineId: string;
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
  const [{ labels: sectorLabels, colors: sectorColors }, sectorsWithModules] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    getSectorsWithEnabledModules(ctx.tenantId),
  ]);
  const visibleSectorCodes = (
    isFullWrite(ctx.role) || ctx.role === "READONLY" ? Array.from(sectorsWithModules) : ctx.sectors
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
  const stageCounts = new Map<string, { value: number; color: string }>();
  for (const item of openPipelineItemsRaw) {
    const key = item.stage.name;
    const prev = stageCounts.get(key);
    stageCounts.set(key, { value: (prev?.value ?? 0) + 1, color: item.stage.color ?? "#586577" });
  }
  const stageChartData = Array.from(stageCounts.entries()).map(([label, v]) => ({ label, value: v.value, color: v.color }));

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

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">
            {firstName ? `Olá, ${firstName}` : "Início"}
          </h1>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            {pendingForMe > 0
              ? `${pendingForMe} pendência${pendingForMe !== 1 ? "s" : ""} precisa${pendingForMe !== 1 ? "m" : ""} de você`
              : <>Aqui está um resumo do workspace {tenant?.name ? <span className="text-fg font-medium">{tenant.name}</span> : ""}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-[length:var(--fs-helper)] text-fg-muted tnum">{today}</p>
          <QuickCreateMenu
            canCreateCompany={canCreateCompany}
            canCreatePerson={canCreatePerson}
            canCreateTransfer={canCreateTransfer}
          />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          href="/empresas"
          icon={<Building2 size={16} />}
          label="Empresas ativas"
          value={companyActiveCount}
          delay={0}
          sub={newCompaniesThisMonth > 0 ? `+${newCompaniesThisMonth} este mês` : undefined}
        />
        <StatCard
          href="/kanban"
          icon={<Clock size={16} />}
          label="Vencidos / hoje"
          value={vencidosCount + hojeCount}
          delay={40}
          highlight={vencidosCount + hojeCount > 0}
          sub={vencidosCount > 0 ? `${vencidosCount} vencido${vencidosCount !== 1 ? "s" : ""}` : undefined}
        />
        <StatCard
          href="/transferencias?status=NEW"
          icon={<ArrowRightLeft size={16} />}
          label="Transferências"
          value={pendingHandoffsCount}
          delay={80}
          highlight={pendingHandoffsCount > 0}
          sub={pendingHandoffsCount > 0 ? "em aberto" : undefined}
        />
        <StatCard
          href="/pessoas"
          icon={<Users size={16} />}
          label="Pessoas cadastradas"
          value={personCount}
          delay={120}
        />
      </div>

      {/* Próxima reunião de hoje */}
      {nextMeeting && (
        <div className="flex items-center justify-between gap-3 bg-brand-subtle border border-brand/20 rounded-2xl px-4 py-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Video size={16} className="text-brand flex-shrink-0" />
            <p className="text-[length:var(--fs-body)] text-fg truncate">
              <span className="font-medium">{nextMeeting.title}</span>
              <span className="text-fg-muted">
                {" · "}
                {formatMeetingWhen(nextMeeting.startAt, todayStart, todayEnd)}
                {" · "}
                {PROVIDER_LABEL[nextMeeting.provider] ?? nextMeeting.provider}
              </span>
            </p>
          </div>
          <a
            href={nextMeeting.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 flex-shrink-0 h-8 px-3 rounded-full bg-brand text-on-brand text-[12.5px] font-medium hover:bg-brand-hover transition-colors"
          >
            Entrar <ExternalLink size={12} />
          </a>
        </div>
      )}

      {/* Corpo: coluna principal (meu trabalho) + coluna lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          {/* Meu dia */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Meu dia</h2>
            {meuDiaItems.length === 0 ? (
              <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhum item com prazo ou atribuído a você.</p>
            ) : (
              <div className="space-y-1">
                {meuDiaItems.map((item) => {
                  const badge = classifyDueDate(item.dueDate, todayStart, todayEnd);
                  return (
                    <Link
                      key={item.id}
                      href={`/kanban/${item.pipelineId}/itens/${item.id}`}
                      className="flex items-center justify-between gap-3 py-2 group"
                    >
                      <span className="text-[length:var(--fs-body)] text-fg group-hover:text-brand transition-colors truncate min-w-0">
                        {entityNames[item.entityId] ?? "(removido)"}
                        <span className="text-fg-muted font-normal">
                          {" · "}
                          {sectorLabels[item.pipeline.sectorCode] ?? item.pipeline.sectorCode}
                          {" · "}
                          {item.stage.name}
                        </span>
                      </span>
                      {badge ? (
                        <span className={`flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 text-[length:var(--fs-helper)] text-fg-muted">Sem prazo</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transferências a revisar */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Transferências a revisar</h2>
            {incomingHandoffsRaw.length === 0 ? (
              <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhuma transferência aguardando o seu setor.</p>
            ) : (
              <div className="space-y-3">
                {incomingHandoffsRaw.map((h) => (
                  <div key={h.id} className="flex items-center justify-between gap-3">
                    <p className="text-[length:var(--fs-body)] text-fg truncate min-w-0">
                      {sectorLabels[h.fromSector] ?? h.fromSector} →{" "}
                      {h.sectors.map((s) => sectorLabels[s.sectorCode] ?? s.sectorCode).join(", ")}
                      {" · "}
                      <span className="font-medium">{entityNames[h.entityId] ?? "(removido)"}</span>
                      <span className="text-fg-muted">{" · "}{h.requester.name} · {formatRelativeTime(h.createdAt)}</span>
                    </p>
                    <Link
                      href={`/transferencias/${h.id}`}
                      className="flex-shrink-0 text-[12.5px] font-medium text-brand border border-brand/30 rounded-full px-3 py-1 hover:bg-brand-subtle transition-colors"
                    >
                      Revisar
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Visão do workspace — só admin/coordenador */}
          {showWorkspaceOverview && (
            <div className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Visão do workspace</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wide mb-2.5">Cards por estágio</p>
                  <HorizontalBarChart data={stageChartData} emptyLabel="Nenhum card em aberto nos seus kanbans." />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wide mb-2.5">Movimentações (14 dias)</p>
                  <TrendChart data={trendData} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          {/* Agenda */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Agenda</h2>
            {upcomingMeetings.length === 0 ? (
              <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhuma reunião agendada.</p>
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
                    <span className="text-[length:var(--fs-body)] text-fg group-hover:text-brand transition-colors truncate min-w-0">
                      {m.title}
                    </span>
                    <span className="text-[length:var(--fs-helper)] text-fg-muted tnum flex-shrink-0">
                      {formatMeetingWhen(m.startAt, todayStart, todayEnd)}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Atividade */}
          <div className="bg-surface border border-border rounded-2xl p-5">
            <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Atividade</h2>
            {activityGroups.length === 0 ? (
              <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {activityGroups.map((g) => (
                  <Link key={g.id} href={`/kanban/${g.pipelineId}/itens/${g.pipelineItemId}`} className="flex items-start gap-2.5 group">
                    <span className="w-6 h-6 rounded-full bg-brand-subtle text-brand text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                      {g.userName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[length:var(--fs-body)] text-fg-secondary leading-snug">
                        <span className="font-medium text-fg group-hover:text-brand transition-colors">{g.userName}</span>{" "}
                        {g.count > 1 ? (
                          `fez ${g.count} alterações em `
                        ) : (
                          `${g.label} `
                        )}
                        <span className="font-medium">{entityNames[g.entityId] ?? "(removido)"}</span>
                      </p>
                      <p className="text-[length:var(--fs-helper)] text-fg-muted">{formatRelativeTime(g.createdAt)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Seus setores */}
          {sectorWidgets.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">
                {sectorWidgets.length > 1 ? "Seus setores" : "Seu setor"}
              </h2>
              <div className="flex flex-col gap-2">
                {sectorWidgets.map((s) => (
                  <Link
                    key={s.code}
                    href={`/setor/${s.code}`}
                    className="group flex items-center justify-between gap-2 bg-surface-hover border border-border rounded-xl px-3.5 py-2.5 hover:border-border-strong transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-fg truncate">{s.label}</p>
                        <p className="text-[11px] text-fg-muted">
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
          )}
        </div>
      </div>
    </PageContainer>
  );
}

function StatCard({
  href,
  icon,
  label,
  value,
  highlight,
  delay = 0,
  sub,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  delay?: number;
  sub?: string;
}) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${delay}ms` }}
      className="reveal-in bg-surface border border-border rounded-2xl px-4 py-3.5 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform] flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex w-7 h-7 rounded-lg items-center justify-center flex-shrink-0 ${
            highlight ? "bg-warning/10 text-warning" : "bg-brand-subtle text-brand"
          }`}
        >
          {icon}
        </span>
        <p className="text-[length:var(--fs-helper)] text-fg-muted truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`font-display text-[length:var(--fs-metric)] font-semibold tnum leading-none ${highlight ? "text-warning" : "text-fg"}`}>
          {value}
        </p>
        {sub && <span className="text-[11px] text-fg-muted truncate">{sub}</span>}
      </div>
    </Link>
  );
}
