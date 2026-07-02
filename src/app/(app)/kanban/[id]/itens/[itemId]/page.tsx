import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { MoveStageSelect } from "@/components/kanban/MoveStageSelect";
import { AddNoteForm } from "@/components/kanban/AddNoteForm";
import { DeleteButton } from "@/components/kanban/DeleteButton";
import { PrazoPrioridadeForm } from "@/components/kanban/PrazoPrioridadeForm";
import { TagToggleList } from "@/components/kanban/TagToggleList";
import { AssigneeToggleList } from "@/components/kanban/AssigneeToggleList";
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
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

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
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
        {canDelete && <DeleteButton action={deleteAction} nome={entity?.name ?? "este item"} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        {/* Coluna principal */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-fg mb-3">Estágio</h2>
            {canAct ? (
              <MoveStageSelect
                itemId={itemId}
                currentStageId={item.stageId}
                stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name }))}
                moveAction={moverItem}
              />
            ) : (
              <p className="text-[13px] text-fg">
                {pipeline.stages.find((s) => s.id === item.stageId)?.name ?? "—"}
              </p>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-fg mb-3">Prazo & Prioridade</h2>
            {canAct ? (
              <PrazoPrioridadeForm
                action={prazoAction}
                dueDate={item.dueDate ? item.dueDate.toISOString() : null}
                priority={item.priority}
              />
            ) : (
              <p className="text-[13px] text-fg">
                {item.dueDate
                  ? item.dueDate.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
                  : "Sem prazo definido"}
              </p>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-fg mb-3">Tags</h2>
            {canAct ? (
              <TagToggleList
                allTags={sectorTags}
                selectedIds={item.tags.map((t) => t.tagId)}
                toggleAction={tagToggleAction}
              />
            ) : sectorTags.filter((t) => item.tags.some((it) => it.tagId === t.id)).length === 0 ? (
              <p className="text-[13px] text-fg-muted">Nenhuma tag.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sectorTags
                  .filter((t) => item.tags.some((it) => it.tagId === t.id))
                  .map((t) => (
                    <span
                      key={t.id}
                      className="text-[12px] font-medium px-2.5 py-1 rounded-full"
                      style={{ background: `${t.color}1A`, color: t.color }}
                    >
                      {t.name}
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-fg mb-3">Responsáveis</h2>
            {canAct ? (
              <AssigneeToggleList
                allUsers={sectorUsers}
                selectedIds={item.assignees.map((a) => a.userId)}
                toggleAction={assigneeToggleAction}
              />
            ) : (
              <p className="text-[13px] text-fg-muted">
                {sectorUsers.filter((u) => item.assignees.some((a) => a.userId === u.id)).map((u) => u.name).join(", ") ||
                  "Nenhum responsável."}
              </p>
            )}
          </div>
        </div>

        {/* Painel de atividades */}
        <div className="bg-surface border border-border rounded-lg p-5 lg:sticky lg:top-6 self-start">
          <h2 className="text-[13px] font-semibold text-fg mb-3">Atividades</h2>

          {canAct && (
            <div className="mb-4">
              <AddNoteForm action={addNoteAction} />
            </div>
          )}

          {activities.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhuma atividade registrada ainda.</p>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto">
              {activities.map((a) => (
                <div key={a.id} className="border-l-2 border-border pl-3 py-0.5">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-[11px] font-medium text-fg-secondary">
                      {ACTIVITY_LABEL[a.type] ?? a.type}
                    </span>
                    <span className="text-[11px] text-fg-muted">·</span>
                    <span className="text-[11px] text-fg-muted">{a.user.name}</span>
                    <span className="text-[11px] text-fg-muted">·</span>
                    <span className="text-[11px] text-fg-muted tnum">
                      {a.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </div>
                  {a.content && <p className="text-[13px] text-fg">{a.content}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
