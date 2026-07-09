import Link from "next/link";
import { PageContainer } from "@/components/shared/PageContainer";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere, scopedPipelineWhere, scopedHandoffWhere } from "@/lib/auth/scope";
import { ROLE_LABELS } from "@/lib/roles";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "adicionou uma nota em",
  STATUS_CHANGE: "moveu",
  DOCUMENT: "anexou um documento em",
  HANDOFF: "registrou um handoff em",
  MENTION: "mencionou você em",
};

function nowDate(): Date {
  return new Date();
}

function inSevenDays(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

export default async function HomePage() {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const [companyCount, personCount, pipelineCount, pendingHandoffs] = await Promise.all([
    prisma.company.count({ where: await scopedCompanyWhere(ctx) }),
    prisma.person.count({ where: await scopedPersonWhere(ctx) }),
    prisma.pipeline.count({ where: scopedPipelineWhere(ctx) }),
    prisma.handoff.count({ where: { ...scopedHandoffWhere(ctx), status: "PENDING" } }),
  ]);

  const [upcomingItems, recentActivities] = await Promise.all([
    prisma.pipelineItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        dueDate: { gte: nowDate(), lte: inSevenDays() },
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
  ]);

  const companyIds = [
    ...upcomingItems.filter((i) => i.entityType === "COMPANY").map((i) => i.entityId),
    ...recentActivities.filter((a) => a.pipelineItem.entityType === "COMPANY").map((a) => a.pipelineItem.entityId),
  ];
  const personIds = [
    ...upcomingItems.filter((i) => i.entityType === "PERSON").map((i) => i.entityId),
    ...recentActivities.filter((a) => a.pipelineItem.entityType === "PERSON").map((a) => a.pipelineItem.entityId),
  ];

  const [companies, people] = await Promise.all([
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    personIds.length > 0
      ? prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const entityNames: Record<string, string> = {};
  companies.forEach((c) => (entityNames[c.id] = c.name));
  people.forEach((p) => (entityNames[p.id] = p.name));

  return (
    <PageContainer>
      <div className="mb-7">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">
          Início
        </h1>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
          Bem-vindo ao Connect — CRM interno da 41 Tech.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard href="/empresas" label="Empresas" value={companyCount} delay={0} />
        <StatCard href="/pessoas" label="Pessoas" value={personCount} delay={40} />
        <StatCard href="/kanban" label="Kanban ativos" value={pipelineCount} delay={80} />
        <StatCard
          href="/transferencias?status=PENDING"
          label="Transferências pendentes"
          value={pendingHandoffs}
          highlight={pendingHandoffs > 0}
          delay={120}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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

      <div className="bg-surface border border-border rounded-2xl p-5">
        <p className="text-[length:var(--fs-body)] font-semibold text-fg mb-1">
          {ROLE_LABELS[ctx.role]}
        </p>
        <p className="text-[length:var(--fs-helper)] text-fg-muted leading-relaxed">
          {ctx.sectors.length > 0
            ? `Você tem acesso a ${ctx.sectors.length} setor${ctx.sectors.length !== 1 ? "es" : ""}.`
            : "Você tem acesso a todos os setores do tenant."}
        </p>
      </div>
    </PageContainer>
  );
}

function StatCard({
  href,
  label,
  value,
  highlight,
  delay = 0,
}: {
  href: string;
  label: string;
  value: number;
  highlight?: boolean;
  delay?: number;
}) {
  return (
    <Link
      href={href}
      style={{ animationDelay: `${delay}ms` }}
      className="reveal-in bg-surface border border-border rounded-2xl px-[18px] py-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform] block flex flex-col gap-2"
    >
      <p className="text-[length:var(--fs-helper)] text-fg-muted">{label}</p>
      <p className={`font-display text-[length:var(--fs-metric)] font-semibold tnum leading-none ${highlight ? "text-warning" : "text-fg"}`}>
        {value}
      </p>
    </Link>
  );
}
