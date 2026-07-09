import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { AddNoteForm } from "@/components/kanban/AddNoteForm";
import { CardActionBar } from "@/components/kanban/CardActionBar";
import {
  moverItem,
  adicionarNota,
  excluirItem,
  atualizarPrazoPrioridade,
  alternarTagItem,
  alternarResponsavelItem,
} from "../../../actions";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "Nota",
  STATUS_CHANGE: "Mudança de estágio",
  DOCUMENT: "Documento",
  HANDOFF: "Handoff",
  MENTION: "Menção",
};

export default async function KanbanItemPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const ctx = await getAuthContext();
  const tenantId = ctx.tenantId;

  const prisma = getPrisma();
  const [pipeline, item] = await Promise.all([
    prisma.pipeline.findFirst({
      where: { id, ...scopedPipelineWhere(ctx) },
      include: { stages: { orderBy: { order: "asc" } } },
    }),
    prisma.pipelineItem.findFirst({
      where: { id: itemId, tenantId },
      include: {
        tags: { select: { tagId: true } },
        assignees: { select: { userId: true } },
      },
    }),
  ]);

  if (!pipeline || !item) notFound();

  const canDelete = canManageSector(ctx, pipeline.sectorCode);
  const canAct = canActOnSector(ctx, pipeline.sectorCode);

  const [entity, activities, sectorTags, sectorUsers] = await Promise.all([
    item.entityType === "COMPANY"
      ? prisma.company.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } })
      : prisma.person.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } }),
    prisma.activity.findMany({
      where: { pipelineItemId: itemId, tenantId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    prisma.tag.findMany({
      where: { tenantId, sectorCode: pipeline.sectorCode },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    getSectorUsers(tenantId, pipeline.sectorCode),
  ]);

  const deleteAction = excluirItem.bind(null, id, itemId);
  const addNoteAction = adicionarNota.bind(null, id, itemId);
  const prazoAction = atualizarPrazoPrioridade.bind(null, id, itemId);
  const tagToggleAction = alternarTagItem.bind(null, id, itemId);
  const assigneeToggleAction = alternarResponsavelItem.bind(null, id, itemId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/kanban" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Kanban
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/kanban/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[160px]"
        >
          {pipeline.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{entity?.name ?? "(removido)"}</span>
      </div>

      <div className="mb-4">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">
          {entity?.name ?? "(removido)"}
        </h1>
        {entity && (
          <Link
            href={item.entityType === "COMPANY" ? `/empresas/${entity.id}` : `/pessoas/${entity.id}`}
            className="text-[13px] text-brand hover:underline"
          >
            Ver ficha completa →
          </Link>
        )}
      </div>

      <CardActionBar
        canAct={canAct}
        canDelete={canDelete}
        itemId={itemId}
        entityName={entity?.name ?? "este item"}
        stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name }))}
        currentStageId={item.stageId}
        moveAction={moverItem}
        dueDate={item.dueDate ? item.dueDate.toISOString() : null}
        priority={item.priority}
        prazoAction={prazoAction}
        allTags={sectorTags}
        selectedTagIds={item.tags.map((t) => t.tagId)}
        tagToggleAction={tagToggleAction}
        allUsers={sectorUsers}
        selectedUserIds={item.assignees.map((a) => a.userId)}
        assigneeToggleAction={assigneeToggleAction}
        deleteAction={deleteAction}
      />

      {/* Atividades */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[13px] font-semibold text-fg mb-3">Atividades</h2>

        {canAct && (
          <div className="mb-3">
            <AddNoteForm action={addNoteAction} />
          </div>
        )}

        {activities.length === 0 ? (
          <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
        ) : (
          <div className="scroll-y max-h-[320px] overflow-y-auto">
            {activities.map((a, i) => {
              const importante = a.type === "STATUS_CHANGE" || a.type === "HANDOFF";
              return (
                <div key={a.id} className="flex gap-2.5 relative pb-3 last:pb-0">
                  {i < activities.length - 1 && (
                    <span className="absolute left-[9px] top-[20px] bottom-0 w-px bg-border" />
                  )}
                  <span
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 z-[1] border ${
                      importante ? "bg-brand-subtle border-brand" : "bg-surface-hover border-border-strong"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${importante ? "bg-brand" : "bg-fg-muted"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[length:var(--fs-body)] text-fg font-medium leading-snug">
                        {ACTIVITY_LABEL[a.type] ?? a.type}
                      </p>
                      <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap flex-shrink-0">
                        {a.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                      </span>
                    </div>
                    <p className="text-[length:var(--fs-helper)] text-fg-muted">{a.user.name}</p>
                    {a.content && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-1">{a.content}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
