import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { PageContainer } from "@/components/shared/PageContainer";
import { moverItem } from "../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { formatInstantDateTime } from "@/lib/format";

function daysSince(d: Date): number {
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

export default async function KanbanBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, ...scopedPipelineWhere(ctx) },
    include: {
      stages: { orderBy: { order: "asc" } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!pipeline) notFound();

  const canAddItem = canManageSector(ctx, pipeline.sectorCode);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  // Resolve nomes das entidades (Company ou Person) referenciadas pelos itens
  const entityIds = pipeline.items.map((i) => i.entityId);
  const entityNames: Record<string, string> = {};

  if (entityIds.length > 0) {
    if (pipeline.entityType === "COMPANY") {
      const companies = await prisma.company.findMany({
        where: { id: { in: entityIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      companies.forEach((c) => (entityNames[c.id] = c.name));
    } else {
      const people = await prisma.person.findMany({
        where: { id: { in: entityIds }, tenantId: ctx.tenantId },
        select: { id: true, name: true },
      });
      people.forEach((p) => (entityNames[p.id] = p.name));
    }
  }

  // Última mudança de estágio de cada item (mais recente primeiro) — usada pra
  // calcular "X dias na etapa" sem precisar de campo novo no schema.
  const [lastStageChanges, recentMoves, recentActivityAnyType] = await Promise.all([
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, type: "STATUS_CHANGE", pipelineItem: { pipelineId: id } },
      orderBy: { createdAt: "desc" },
      select: { pipelineItemId: true, createdAt: true },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, type: "STATUS_CHANGE", pipelineItem: { pipelineId: id } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } }, pipelineItem: { select: { entityId: true } } },
    }),
    // última atividade (qualquer tipo) por item — usada só pra linha única do card no board.
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipelineId: id } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { pipelineItemId: true, type: true, content: true },
    }),
  ]);

  const ACTIVITY_LABEL: Record<string, string> = {
    NOTE: "Nota", STATUS_CHANGE: "Mudou de etapa", DOCUMENT: "Anexou documento",
    HANDOFF: "Transferência", MENTION: "Menção",
  };
  const lastActivityByItem: Record<string, string> = {};
  for (const a of recentActivityAnyType) {
    if (a.pipelineItemId in lastActivityByItem) continue;
    lastActivityByItem[a.pipelineItemId] = a.content?.trim() ? a.content : (ACTIVITY_LABEL[a.type] ?? a.type);
  }

  const lastChangeByItem: Record<string, Date> = {};
  for (const c of lastStageChanges) {
    if (!(c.pipelineItemId in lastChangeByItem)) lastChangeByItem[c.pipelineItemId] = c.createdAt;
  }
  const items = pipeline.items.map((i) => ({
    id: i.id,
    stageId: i.stageId,
    entityName: entityNames[i.entityId] ?? "(removido)",
    priority: i.priority,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    tags: i.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    assignees: i.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    daysInStage: daysSince(lastChangeByItem[i.id] ?? i.createdAt),
    lastActivity: lastActivityByItem[i.id] ?? null,
  }));

  const timeline = recentMoves.map((m) => ({
    id: m.id,
    userName: m.user.name,
    entityName: entityNames[m.pipelineItem.entityId] ?? "(removido)",
    content: m.content ?? "",
    createdAt: formatInstantDateTime(m.createdAt),
  }));

  return (
    <PageContainer className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/kanban" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Kanban
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{pipeline.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">{pipeline.name}</h1>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
            {sectorLabels[pipeline.sectorCode] ?? pipeline.sectorCode} ·{" "}
            {pipeline.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
          </p>
        </div>
        {canAddItem && (
          <Link
            href={`/kanban/${id}/novo-item`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] bg-brand text-on-brand text-[length:var(--fs-button)] font-semibold hover:bg-brand-hover transition-colors"
          >
            + Item
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <KanbanBoard
          pipelineId={id}
          stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, isTerminal: s.isTerminal }))}
          items={items}
          moveAction={moverItem}
        />
      </div>

      {timeline.length > 0 && (
        <div className="flex-shrink-0 mt-4 pt-4 border-t border-border">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-2.5">
            Timeline de movimentação
          </h2>
          {/* Horizontal em vez de vertical — libera altura pro board do Kanban,
              que é o conteúdo principal da tela. */}
          <div className="scroll-x flex gap-2.5 overflow-x-auto pb-1">
            {timeline.map((t) => (
              <div
                key={t.id}
                className="flex-shrink-0 w-[220px] bg-surface-hover border border-border rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                  <span className="font-mono text-[10px] text-fg-muted truncate">{t.createdAt}</span>
                </div>
                <p className="text-[12px] text-fg-secondary leading-snug line-clamp-2">
                  <span className="font-semibold text-fg">{t.entityName}</span> {t.content}
                </p>
                <p className="text-[11px] text-fg-muted mt-1 truncate">{t.userName}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageContainer>
  );
}
