import Link from "next/link";
import {
  Building2,
  Users,
  Columns3,
  Clock,
  Bell,
  ArrowRightLeft,
  Plus,
  Settings,
  ChevronRight,
} from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { HorizontalBarChart, DonutChart, TrendChart } from "@/components/shared/Charts";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { getTenantModuleStates, getSectorsWithEnabledModules } from "@/lib/modules";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "adicionou uma nota em",
  STATUS_CHANGE: "moveu",
  DOCUMENT: "anexou um documento em",
  HANDOFF: "registrou um handoff em",
  MENTION: "mencionou você em",
};

const COMPANY_STATUS_LABEL: Record<string, string> = {
  PROSPECT: "Prospecto",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  CHURNED: "Cancelado",
};

const COMPANY_STATUS_COLOR: Record<string, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE: "var(--c41-success)",
  INACTIVE: "var(--c41-fg-muted)",
  CHURNED: "var(--c41-danger)",
};

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

function nowDate(): Date {
  return new Date();
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export default async function HomePage() {
  const ctx = await getAuthContext();
  const canCreateCompany = canWrite(ctx.role);
  const canCreatePerson = canWrite(ctx.role);
  const canCreateTransfer = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const canOpenAdmin = canCreateTransfer;

  const prisma = getPrisma();
  const fourteenDaysAgo = daysFromNow(-14);

  const [
    me,
    tenant,
    companyActiveCount,
    personCount,
    pipelineCount,
    unreadNotifications,
    pendingHandoffs,
    upcomingItems,
    recentActivities,
    companyByStatusRaw,
    openItemsForCharts,
    activityCreatedDates,
  ] = await Promise.all([
    ctx.userId ? prisma.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }) : Promise.resolve(null),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { name: true } }),
    prisma.company.count({ where: { ...(await scopedCompanyWhere(ctx)), status: "ACTIVE" } }),
    prisma.person.count({ where: { ...(await scopedPersonWhere(ctx)), type: "COLABORADOR" } }),
    prisma.pipeline.count({ where: scopedPipelineWhere(ctx) }),
    ctx.userId
      ? prisma.notification.count({ where: { tenantId: ctx.tenantId, userId: ctx.userId, read: false } })
      : Promise.resolve(0),
    prisma.handoff.count({ where: { ...scopedHandoffWhere(ctx), status: "PENDING" } }),
    prisma.pipelineItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        dueDate: { gte: nowDate(), lte: daysFromNow(7) },
        pipeline: scopedPipelineWhere(ctx),
      },
      orderBy: { dueDate: "asc" },
      take: 6,
      include: { pipeline: { select: { id: true, name: true } } },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipeline: scopedPipelineWhere(ctx) } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true } },
        pipelineItem: { select: { id: true, pipelineId: true, entityId: true, entityType: true } },
      },
    }),
    prisma.company.groupBy({
      by: ["status"],
      where: await scopedCompanyWhere(ctx),
      _count: { _all: true },
    }),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } },
      select: { priority: true, stage: { select: { name: true, color: true } } },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipeline: scopedPipelineWhere(ctx) }, createdAt: { gte: fourteenDaysAgo } },
      select: { createdAt: true },
    }),
  ]);

  // Nomes das entidades referenciadas nos prazos/atividades (Company ou Person).
  const companyIds = [
    ...upcomingItems.filter((i) => i.entityType === "COMPANY").map((i) => i.entityId),
    ...recentActivities.filter((a) => a.pipelineItem.entityType === "COMPANY").map((a) => a.pipelineItem.entityId),
  ];
  const personIds = [
    ...upcomingItems.filter((i) => i.entityType === "PERSON").map((i) => i.entityId),
    ...recentActivities.filter((a) => a.pipelineItem.entityType === "PERSON").map((a) => a.pipelineItem.entityId),
  ];
  const [companiesNamed, peopleNamed] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    personIds.length > 0
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const entityNames: Record<string, string> = {};
  companiesNamed.forEach((c) => (entityNames[c.id] = c.name));
  peopleNamed.forEach((p) => (entityNames[p.id] = p.name));

  // Widget "seus setores" — só setores com módulo habilitado; escopo (todos, se
  // acesso total) ou restrito aos setores do usuário (SECTOR_ADMIN/SECTOR_USER).
  const [{ labels: sectorLabels, colors: sectorColors }, sectorsWithModules, moduleStates] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    getSectorsWithEnabledModules(ctx.tenantId),
    getTenantModuleStates(ctx.tenantId),
  ]);
  const visibleSectorCodes = (
    isFullWrite(ctx.role) || ctx.role === "READONLY" ? Array.from(sectorsWithModules) : ctx.sectors
  ).filter((code) => sectorsWithModules.has(code));
  const sectorWidgets = visibleSectorCodes.map((code) => ({
    code,
    label: sectorLabels[code] ?? code,
    color: sectorColors[code] ?? "#586577",
    moduleCount: moduleStates.filter((m) => m.sectorCode === code && m.enabled).length,
  }));

  // Kanban por estágio + pendências por prioridade — mesma consulta, dois recortes.
  const stageCounts = new Map<string, { value: number; color: string }>();
  for (const item of openItemsForCharts) {
    const key = item.stage.name;
    const prev = stageCounts.get(key);
    stageCounts.set(key, { value: (prev?.value ?? 0) + 1, color: item.stage.color ?? "#586577" });
  }
  const stageChartData = Array.from(stageCounts.entries()).map(([label, v]) => ({ label, value: v.value, color: v.color }));

  const priorityCounts = [0, 1, 2].map((p) => ({
    label: PRIORITY_LABEL[p],
    value: openItemsForCharts.filter((i) => i.priority === p).length,
    color: PRIORITY_COLOR[p],
  }));

  const companyStatusData = companyByStatusRaw
    .map((row) => ({
      label: COMPANY_STATUS_LABEL[row.status] ?? row.status,
      value: row._count._all,
      color: COMPANY_STATUS_COLOR[row.status] ?? "#586577",
    }))
    .filter((d) => d.value > 0);

  // Movimentações por dia, últimos 14 dias.
  const dayBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    const d = daysFromNow(-i);
    const key = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    dayBuckets.set(key, 0);
  }
  for (const a of activityCreatedDates) {
    const key = a.createdAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + 1);
  }
  const trendData = Array.from(dayBuckets.entries()).map(([label, value]) => ({ label, value }));

  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const firstName = me?.name?.trim().split(/\s+/)[0] ?? "";

  return (
    <PageContainer>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">
            {firstName ? `Olá, ${firstName}` : "Início"}
          </h1>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            Aqui está um resumo do workspace {tenant?.name ? <span className="text-fg font-medium">{tenant.name}</span> : ""}
          </p>
        </div>
        <p className="text-[length:var(--fs-helper)] text-fg-muted tnum">{today}</p>
      </div>

      {/* Cards de indicadores */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard href="/empresas" icon={<Building2 size={16} />} label="Empresas ativas" value={companyActiveCount} delay={0} />
        <StatCard href="/pessoas" icon={<Users size={16} />} label="Pessoas cadastradas" value={personCount} delay={40} />
        <StatCard href="/kanban" icon={<Columns3 size={16} />} label="Kanbans ativos" value={pipelineCount} delay={80} />
        <StatCard href="/kanban" icon={<Clock size={16} />} label="Prazos (7 dias)" value={upcomingItems.length} delay={120} highlight={upcomingItems.length > 0} />
        <StatCard href="/notificacoes" icon={<Bell size={16} />} label="Notificações" value={unreadNotifications} delay={160} highlight={unreadNotifications > 0} />
        <StatCard
          href="/transferencias?status=PENDING"
          icon={<ArrowRightLeft size={16} />}
          label="Transferências"
          value={pendingHandoffs}
          delay={200}
          highlight={pendingHandoffs > 0}
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Cards do Kanban por estágio</h2>
          <HorizontalBarChart data={stageChartData} emptyLabel="Nenhum card em aberto nos seus kanbans." />
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Empresas por status</h2>
          <DonutChart data={companyStatusData} emptyLabel="Nenhuma empresa cadastrada ainda." />
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Movimentações (14 dias)</h2>
          <TrendChart data={trendData} />
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Pendências por prioridade</h2>
          <HorizontalBarChart data={priorityCounts} emptyLabel="Nenhum card em aberto nos seus kanbans." />
        </div>
      </div>

      {/* Prazos próximos + Atividade recente */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Prazos próximos (7 dias)</h2>
          {upcomingItems.length === 0 ? (
            <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhum prazo nos próximos 7 dias.</p>
          ) : (
            <div className="space-y-3">
              {upcomingItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/kanban/${item.pipelineId}/itens/${item.id}`}
                  className="flex items-center justify-between gap-2 group"
                >
                  <span className="text-[length:var(--fs-body)] text-fg group-hover:text-brand transition-colors truncate">
                    {entityNames[item.entityId] ?? "(removido)"}
                  </span>
                  <span className="text-[length:var(--fs-helper)] text-fg-muted tnum flex-shrink-0">
                    {item.dueDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} ·{" "}
                    {item.pipeline.name}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Atividade recente</h2>
          {recentActivities.length === 0 ? (
            <p className="text-[length:var(--fs-body)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
          ) : (
            <div className="space-y-3">
              {recentActivities.map((a) => (
                <Link
                  key={a.id}
                  href={`/kanban/${a.pipelineItem.pipelineId}/itens/${a.pipelineItem.id}`}
                  className="block group"
                >
                  <p className="text-[length:var(--fs-body)] text-fg-secondary leading-snug">
                    <span className="font-medium text-fg group-hover:text-brand transition-colors">{a.user.name}</span>{" "}
                    {ACTIVITY_LABEL[a.type] ?? "atualizou"}{" "}
                    <span className="font-medium">{entityNames[a.pipelineItem.entityId] ?? "(removido)"}</span>
                  </p>
                  <p className="text-[length:var(--fs-helper)] text-fg-muted">
                    {a.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="bg-surface border border-border rounded-2xl p-5 mb-4">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">Ações rápidas</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {canCreateCompany && <QuickAction href="/empresas/nova" icon={<Plus size={15} />} label="Nova Empresa" />}
          {canCreatePerson && <QuickAction href="/pessoas/nova" icon={<Plus size={15} />} label="Nova Pessoa" />}
          <QuickAction href="/kanban" icon={<Columns3 size={15} />} label="Abrir Kanban" />
          {canCreateTransfer && <QuickAction href="/transferencias/novo" icon={<ArrowRightLeft size={15} />} label="Nova Transferência" />}
          <QuickAction href="/notificacoes" icon={<Bell size={15} />} label="Notificações" />
          {canOpenAdmin && <QuickAction href="/admin" icon={<Settings size={15} />} label="Configurações" />}
        </div>
      </div>

      {/* Seus setores */}
      {sectorWidgets.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-3.5">
            {sectorWidgets.length > 1 ? "Seus setores" : "Seu setor"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sectorWidgets.map((s) => (
              <Link
                key={s.code}
                href={`/setor/${s.code}`}
                className="group flex items-center justify-between gap-2 bg-surface-hover border border-border rounded-xl px-4 py-3 hover:border-border-strong transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg truncate">{s.label}</p>
                    <p className="text-[11px] text-fg-muted">
                      {s.moduleCount} módulo{s.moduleCount !== 1 ? "s" : ""} disponíve{s.moduleCount !== 1 ? "is" : "l"}
                    </p>
                  </div>
                </div>
                <ChevronRight size={15} className="text-fg-muted flex-shrink-0 group-hover:text-fg transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}
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
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${delay}ms` }}
      className="reveal-in bg-surface border border-border rounded-2xl px-4 py-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform] flex flex-col gap-2.5"
    >
      <span
        className={`inline-flex w-8 h-8 rounded-lg items-center justify-center ${
          highlight ? "bg-warning/10 text-warning" : "bg-brand-subtle text-brand"
        }`}
      >
        {icon}
      </span>
      <div>
        <p className={`font-display text-[length:var(--fs-metric)] font-semibold tnum leading-none ${highlight ? "text-warning" : "text-fg"}`}>
          {value}
        </p>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">{label}</p>
      </div>
    </Link>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 bg-surface-hover border border-border rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:border-border-strong transition-colors"
    >
      <span className="text-fg-muted flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
