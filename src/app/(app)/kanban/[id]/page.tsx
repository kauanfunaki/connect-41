import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { BoardView } from "@/components/kanban/BoardView";
import { DuplicatePipelineButton } from "@/components/kanban/DuplicatePipelineButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { moverItem, duplicarPipeline } from "../actions";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedPipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";

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
      // parentItemId: null — subtarefas não viram card solto no board, só
      // aparecem dentro do detalhe do item pai.
      items: {
        where: { parentItemId: null },
        orderBy: { createdAt: "asc" },
        include: {
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
          assignees: { include: { user: { select: { id: true, name: true } } } },
          subtasks: { select: { id: true, title: true, priority: true, stage: { select: { name: true, isTerminal: true } } } },
        },
      },
    },
  });

  if (!pipeline) notFound();

  const canAddItem = canManageSector(ctx, pipeline.sectorCode);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const duplicateEntities =
    pipeline.entityType === "COMPANY"
      ? (await prisma.company.findMany({ where: await scopedCompanyWhere(ctx), orderBy: { name: "asc" }, select: { id: true, name: true } }))
      : (await prisma.person.findMany({ where: await scopedPersonWhere(ctx), orderBy: { name: "asc" }, select: { id: true, name: true } }));

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
  const [lastStageChanges, recentActivityAnyType] = await Promise.all([
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, type: "STATUS_CHANGE", pipelineItem: { pipelineId: id } },
      orderBy: { createdAt: "desc" },
      select: { pipelineItemId: true, createdAt: true },
    }),
    // última atividade (qualquer tipo) por item — usada pra linha única do card
    // no board, e pra achar quem criou cada item (type CREATED) sem query extra.
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { pipelineId: id } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { pipelineItemId: true, type: true, content: true, user: { select: { id: true, name: true } } },
    }),
  ]);

  const ACTIVITY_LABEL: Record<string, string> = {
    NOTE: "Nota", STATUS_CHANGE: "Mudou de etapa", DOCUMENT: "Anexou documento",
    HANDOFF: "Transferência", MENTION: "Menção", CREATED: "Criado",
    PRIORITY_CHANGE: "Mudou prioridade", DUE_DATE_CHANGE: "Mudou prazo",
    DESCRIPTION_CHANGE: "Editou descrição", ASSIGNEE_CHANGE: "Mudou responsável", TAG_CHANGE: "Mudou etiqueta",
  };
  const lastActivityByItem: Record<string, string> = {};
  const creatorByItem: Record<string, { id: string; name: string }> = {};
  for (const a of recentActivityAnyType) {
    if (!(a.pipelineItemId in lastActivityByItem)) {
      lastActivityByItem[a.pipelineItemId] = a.content?.trim() ? a.content : (ACTIVITY_LABEL[a.type] ?? a.type);
    }
    if (a.type === "CREATED") creatorByItem[a.pipelineItemId] = a.user;
  }

  const lastChangeByItem: Record<string, Date> = {};
  for (const c of lastStageChanges) {
    if (!(c.pipelineItemId in lastChangeByItem)) lastChangeByItem[c.pipelineItemId] = c.createdAt;
  }
  const items = pipeline.items.map((i) => ({
    id: i.id,
    stageId: i.stageId,
    entityName: i.title ?? entityNames[i.entityId] ?? "(removido)",
    priority: i.priority,
    dueDate: i.dueDate ? i.dueDate.toISOString() : null,
    tags: i.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    assignees: i.assignees.map((a) => ({ id: a.user.id, name: a.user.name })),
    daysInStage: daysSince(lastChangeByItem[i.id] ?? i.createdAt),
    lastActivity: lastActivityByItem[i.id] ?? null,
    description: i.description,
    creator: creatorByItem[i.id] ?? null,
    subtaskTotal: i.subtasks.length,
    subtaskDone: i.subtasks.filter((s) => s.stage.isTerminal).length,
    subtasks: i.subtasks.map((s) => ({
      id: s.id,
      entityName: s.title ?? "(sem título)",
      stageName: s.stage.name,
      isTerminal: s.stage.isTerminal,
      priority: s.priority,
    })),
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
          <div className="flex items-center gap-2">
            {duplicateEntities.length > 0 && (
              <DuplicatePipelineButton
                action={duplicarPipeline.bind(null, id)}
                entities={duplicateEntities}
                entityLabel={pipeline.entityType === "COMPANY" ? "Empresa" : "Pessoa"}
                defaultName={`${pipeline.name} — cópia`}
              />
            )}
            <Link
              href={`/kanban/${id}/novo-item`}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] bg-brand text-on-brand text-[length:var(--fs-button)] font-semibold hover:bg-brand-hover transition-colors"
            >
              + Item
            </Link>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <BoardView
          pipelineId={id}
          basePath={`/kanban/${id}`}
          stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, isTerminal: s.isTerminal }))}
          items={items}
          moveAction={moverItem}
        />
      </div>
    </PageContainer>
  );
}
