import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CardActionBar } from "@/components/kanban/CardActionBar";
import { DescriptionEditor } from "@/components/kanban/DescriptionEditor";
import { ActivityFeed, type FeedItem } from "@/components/kanban/ActivityFeed";
import { MeetingsSection } from "@/components/kanban/MeetingsSection";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { listDocuments } from "@/lib/documents";
import { SubtasksSection } from "@/components/kanban/SubtasksSection";
import { ChecklistSection } from "@/components/kanban/ChecklistSection";
import { TimeTrackingSection } from "@/components/kanban/TimeTrackingSection";
import { CompletionBanner } from "@/components/kanban/CompletionBanner";
import {
  moverItem,
  adicionarNota,
  editarNota,
  excluirNota,
  excluirItem,
  atualizarPrazoPrioridade,
  atualizarDescricao,
  alternarTagItem,
  alternarResponsavelItem,
  alternarObservadorItem,
  criarSubtarefa,
  excluirSubtarefa,
  criarChecklistItem,
  alternarChecklistItem,
  editarChecklistItem,
  excluirChecklistItem,
  reordenarChecklistItem,
  concluirTarefa,
  reabrirTarefa,
  atualizarEstimativa,
  criarLancamentoTempo,
  excluirLancamentoTempo,
} from "@/app/(app)/kanban/actions";
import { boardPath } from "@/lib/kanbanPaths";
import { agendarReuniao, excluirReuniao } from "@/app/(app)/kanban/meetings-actions";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "Nota",
  STATUS_CHANGE: "Mudança de estágio",
  DOCUMENT: "Documento",
  HANDOFF: "Transferência",
  MENTION: "Menção",
  CREATED: "Tarefa criada",
  PRIORITY_CHANGE: "Prioridade alterada",
  DUE_DATE_CHANGE: "Prazo alterado",
  DESCRIPTION_CHANGE: "Descrição alterada",
  ASSIGNEE_CHANGE: "Responsável alterado",
  TAG_CHANGE: "Etiqueta alterada",
  CHECKLIST_CHANGE: "Checklist alterado",
  SUBTASK_CHANGE: "Subtarefa alterada",
  COMPLETED: "Tarefa concluída",
  REOPENED: "Tarefa reaberta",
  TIME_LOGGED: "Tempo apontado",
};

const IMPORTANT_ACTIVITY_TYPES = new Set([
  "STATUS_CHANGE", "HANDOFF", "CREATED", "PRIORITY_CHANGE", "DUE_DATE_CHANGE", "ASSIGNEE_CHANGE", "DOCUMENT",
  "COMPLETED", "REOPENED",
]);

type Props = {
  id: string;
  itemId: string;
  /** false dentro do modal — o contexto do quadro já fica visível atrás. */
  showBreadcrumb?: boolean;
};

// Conteúdo do detalhe de um item de Kanban — usado tanto pela rota completa
// (/kanban/[id]/itens/[itemId]) quanto pelo modal interceptado que abre sobre
// o quadro, evitando duplicar a busca de dados e o JSX entre as duas.
export async function KanbanItemDetail({ id, itemId, showBreadcrumb = true }: Props) {
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
        watchers: { select: { userId: true } },
      },
    }),
  ]);

  if (!pipeline || !item) notFound();

  const canDelete = canManageSector(ctx, pipeline.sectorCode);
  const canAct = canActOnSector(ctx, pipeline.sectorCode);

  const canScheduleMeetings = canManageMeetings(ctx);

  const [entity, activities, sectorTags, sectorUsers, meetings, oauthAccounts, documents] = await Promise.all([
    item.entityType === "COMPANY"
      ? prisma.company.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } })
      : prisma.person.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } }),
    prisma.activity.findMany({
      where: { pipelineItemId: itemId, tenantId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.tag.findMany({
      where: { tenantId, sectorCode: pipeline.sectorCode },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    getSectorUsers(tenantId, pipeline.sectorCode),
    prisma.meeting.findMany({
      where: { tenantId, pipelineItemId: itemId },
      orderBy: { startAt: "desc" },
      include: { attendees: { include: { user: { select: { id: true, name: true } } } } },
    }),
    canScheduleMeetings
      ? prisma.oAuthAccount.findMany({ where: { tenantId, userId: ctx.userId }, select: { provider: true } })
      : Promise.resolve([]),
    listDocuments(tenantId, "PIPELINE_ITEM", itemId),
  ]);

  const [parentItem, subtasks, checklistItems, mentionUsers, timeEntries, lastCompletion] = await Promise.all([
    item.parentItemId
      ? prisma.pipelineItem.findFirst({ where: { id: item.parentItemId, tenantId }, select: { id: true, title: true, entityId: true, entityType: true } })
      : Promise.resolve(null),
    item.parentItemId
      ? Promise.resolve([])
      : prisma.pipelineItem.findMany({
          where: { parentItemId: itemId, tenantId },
          orderBy: { createdAt: "asc" },
          include: { stage: { select: { name: true, isTerminal: true } } },
        }),
    prisma.checklistItem.findMany({ where: { pipelineItemId: itemId, tenantId }, orderBy: { order: "asc" } }),
    // @menção em comentário pode citar qualquer usuário do tenant (não só do
    // setor) — mesma regra do autocomplete de Transferências.
    prisma.user.findMany({ where: { tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.timeEntry.findMany({
      where: { pipelineItemId: itemId, tenantId },
      orderBy: { loggedOn: "desc" },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.activity.findFirst({
      where: { pipelineItemId: itemId, tenantId, type: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
  ]);

  const currentStage = pipeline.stages.find((s) => s.id === item.stageId);
  const isCompleted = currentStage?.isTerminal ?? false;

  let parentEntityName: string | null = null;
  if (parentItem) {
    const parentEntity =
      parentItem.entityType === "COMPANY"
        ? await prisma.company.findFirst({ where: { id: parentItem.entityId, tenantId }, select: { name: true } })
        : await prisma.person.findFirst({ where: { id: parentItem.entityId, tenantId }, select: { name: true } });
    parentEntityName = parentItem.title ?? parentEntity?.name ?? "(removido)";
  }

  const deleteAction = excluirItem.bind(null, id, itemId);
  const addNoteAction = adicionarNota.bind(null, id, itemId);
  const editNoteAction = editarNota.bind(null, id, itemId);
  const deleteNoteAction = excluirNota.bind(null, id, itemId);
  const prazoAction = atualizarPrazoPrioridade.bind(null, id, itemId);
  const descricaoAction = atualizarDescricao.bind(null, id, itemId);
  const tagToggleAction = alternarTagItem.bind(null, id, itemId);
  const assigneeToggleAction = alternarResponsavelItem.bind(null, id, itemId);
  const watcherToggleAction = alternarObservadorItem.bind(null, id, itemId);
  const scheduleMeetingAction = agendarReuniao.bind(null, id, itemId);
  const deleteMeetingAction = excluirReuniao.bind(null, id);
  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  const basePath = boardPath(pipeline);
  const createSubtaskAction = criarSubtarefa.bind(null, itemId);
  const deleteSubtaskAction = excluirSubtarefa.bind(null, itemId);
  const createChecklistAction = criarChecklistItem.bind(null, itemId);
  const toggleChecklistAction = alternarChecklistItem.bind(null, itemId);
  const editChecklistAction = editarChecklistItem.bind(null, itemId);
  const deleteChecklistAction = excluirChecklistItem.bind(null, itemId);
  const reorderChecklistAction = reordenarChecklistItem.bind(null, itemId);
  const concluirAction = concluirTarefa.bind(null, id, itemId);
  const reabrirAction = reabrirTarefa.bind(null, id, itemId);
  const estimateAction = atualizarEstimativa.bind(null, id, itemId);
  const createTimeEntryAction = criarLancamentoTempo.bind(null, itemId);
  const deleteTimeEntryAction = excluirLancamentoTempo.bind(null, id, itemId);

  // Monta o feed: comentários (NOTE) de topo + eventos, com respostas
  // aninhadas sob cada comentário. canModify = autor da nota ou coordenador.
  function canModifyNote(noteUserId: string): boolean {
    return noteUserId === ctx.userId || canDelete;
  }
  const repliesByParent = new Map<string, typeof activities>();
  for (const a of activities) {
    if (a.parentActivityId) {
      const list = repliesByParent.get(a.parentActivityId) ?? [];
      list.push(a);
      repliesByParent.set(a.parentActivityId, list);
    }
  }
  const feedItems: FeedItem[] = activities
    .filter((a) => !a.parentActivityId)
    .map((a) => ({
      id: a.id,
      type: a.type,
      label: ACTIVITY_LABEL[a.type] ?? a.type,
      createdAtLabel: formatInstantDateTime(a.createdAt),
      userId: a.user.id,
      userName: a.user.name,
      content: a.content,
      importante: IMPORTANT_ACTIVITY_TYPES.has(a.type),
      isComment: a.type === "NOTE",
      edited: a.editedAt != null,
      canModify: a.type === "NOTE" && canModifyNote(a.user.id),
      replies: (repliesByParent.get(a.id) ?? [])
        .slice()
        .sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime())
        .map((r) => ({
          id: r.id,
          userId: r.user.id,
          userName: r.user.name,
          createdAtLabel: formatInstantDateTime(r.createdAt),
          content: r.content,
          edited: r.editedAt != null,
          canModify: canModifyNote(r.user.id),
        })),
    }));

  return (
    <div>
      {showBreadcrumb && (
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
          <span className="text-[13px] text-fg truncate">{item.title ?? entity?.name ?? "(removido)"}</span>
        </div>
      )}

      <div className="mb-4">
        {item.parentItemId && (
          <Link
            href={`${basePath}/itens/${item.parentItemId}`}
            className="text-[12px] text-fg-muted hover:text-fg transition-colors inline-block mb-1"
          >
            ← Subtarefa de &quot;{parentEntityName}&quot;
          </Link>
        )}
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">
          {item.title ?? entity?.name ?? "(removido)"}
        </h1>
        {entity && !item.title && (
          <Link
            href={item.entityType === "COMPANY" ? `/empresas/${entity.id}` : `/pessoas/${entity.id}`}
            className="text-[13px] text-brand hover:underline"
          >
            Ver ficha completa →
          </Link>
        )}
        {entity && item.title && (
          <p className="text-[13px] text-fg-muted">
            {entity.name} ·{" "}
            <Link
              href={item.entityType === "COMPANY" ? `/empresas/${entity.id}` : `/pessoas/${entity.id}`}
              className="text-brand hover:underline"
            >
              Ver ficha completa →
            </Link>
          </p>
        )}
      </div>

      <CompletionBanner
        canAct={canAct}
        isCompleted={isCompleted}
        completedByLabel={
          isCompleted && lastCompletion
            ? `Concluída em ${formatInstantDate(lastCompletion.createdAt)} por ${lastCompletion.user.name}`
            : isCompleted
              ? "Tarefa concluída"
              : null
        }
        concluirAction={concluirAction}
        reabrirAction={reabrirAction}
      />

      <CardActionBar
        canAct={canAct}
        canDelete={canDelete}
        itemId={itemId}
        entityName={item.title ?? entity?.name ?? "este item"}
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
        selectedWatcherIds={item.watchers.map((w) => w.userId)}
        watcherToggleAction={watcherToggleAction}
        deleteAction={deleteAction}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <DescriptionEditor canAct={canAct} description={item.description} action={descricaoAction} />

          {!item.parentItemId && (
            <SubtasksSection
              canAct={canAct}
              canDelete={canDelete}
              basePath={basePath}
              subtasks={subtasks.map((s) => ({
                id: s.id,
                title: s.title ?? "(sem título)",
                stageName: s.stage.name,
                isTerminal: s.stage.isTerminal,
                priority: s.priority,
              }))}
              createAction={createSubtaskAction}
              deleteAction={deleteSubtaskAction}
            />
          )}

          <ChecklistSection
            canAct={canAct}
            items={checklistItems.map((c) => ({ id: c.id, text: c.text, done: c.done }))}
            createAction={createChecklistAction}
            toggleAction={toggleChecklistAction}
            editAction={editChecklistAction}
            deleteAction={deleteChecklistAction}
            reorderAction={reorderChecklistAction}
          />

          <TimeTrackingSection
            canAct={canAct}
            estimateMinutes={item.estimateMinutes}
            entries={timeEntries.map((e) => ({
              id: e.id,
              userId: e.user.id,
              userName: e.user.name,
              minutes: e.minutes,
              note: e.note,
              loggedOnLabel: formatCalendarDate(e.loggedOn),
              canDelete: e.user.id === ctx.userId || canDelete,
            }))}
            estimateAction={estimateAction}
            createEntryAction={createTimeEntryAction}
            deleteEntryAction={deleteTimeEntryAction}
          />

          <DocumentsSection
            entityType="PIPELINE_ITEM"
            entityId={itemId}
            canUpload={canAct}
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              category: d.category,
              sensitive: d.sensitive,
              uploadedByName: d.uploadedBy.name,
              createdAtLabel: formatInstantDate(d.createdAt),
              expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
              expired: d.expiresAt != null && d.expiresAt < new Date(),
            }))}
          />
        </div>
        <ActivityFeed
          items={feedItems}
          canAct={canAct}
          mentionUsers={mentionUsers}
          addNoteAction={addNoteAction}
          editAction={editNoteAction}
          deleteAction={deleteNoteAction}
        />
      </div>

      <MeetingsSection
        meetings={meetings.map((m) => ({
          id: m.id,
          provider: m.provider,
          title: m.title,
          meetingUrl: m.meetingUrl,
          startAt: m.startAt.toISOString(),
          endAt: m.endAt.toISOString(),
          attendees: m.attendees.map((a) => ({ id: a.user.id, name: a.user.name })),
        }))}
        canSchedule={canScheduleMeetings}
        hasGoogle={hasGoogle}
        hasMicrosoft={hasMicrosoft}
        allUsers={sectorUsers}
        scheduleAction={scheduleMeetingAction}
        deleteAction={deleteMeetingAction}
      />
    </div>
  );
}
