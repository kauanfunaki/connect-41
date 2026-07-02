import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { moverItem } from "../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

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

  const items = pipeline.items.map((i) => ({
    id: i.id,
    stageId: i.stageId,
    entityName: entityNames[i.entityId] ?? "(removido)",
    priority: i.priority,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    tags: i.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    assignees: i.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
  }));

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        <Link href="/kanban" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Kanban
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{pipeline.name}</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{pipeline.name}</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {sectorLabels[pipeline.sectorCode] ?? pipeline.sectorCode} ·{" "}
            {pipeline.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
          </p>
        </div>
        {canAddItem && (
          <Link
            href={`/kanban/${id}/itens/novo`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
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
    </div>
  );
}
