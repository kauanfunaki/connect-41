import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { getPrisma } from "@/lib/prisma";
import { DescriptionEditor } from "@/components/kanban/DescriptionEditor";
import { ActivityFeed, type FeedItem, type TaskMentionCandidate } from "@/components/kanban/ActivityFeed";
import { TaskAttachmentsSection } from "@/components/kanban/TaskAttachmentsSection";
import { listDocuments } from "@/lib/documents";
import { SubtasksSection } from "@/components/kanban/SubtasksSection";
import { ChecklistSection } from "@/components/kanban/ChecklistSection";
import { LinkedItemsSection } from "@/components/kanban/LinkedItemsSection";
import { DetailSection } from "@/components/kanban/DetailSection";
import { TaskFieldsPanel } from "@/components/kanban/TaskFieldsPanel";
import { CompletionBanner } from "@/components/kanban/CompletionBanner";
import { DeleteTaskButton } from "@/components/kanban/DeleteTaskButton";
import { Button } from "@/components/ui/Button";
import { ArrowRight } from "lucide-react";
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
  iniciarCronometro,
  pararCronometro,
  criarLinkItem,
  removerLinkItem,
  editarLancamentoTempo,
  excluirLancamentoTempo,
} from "@/app/(app)/kanban/actions";
import { ListaDeHoras } from "@/components/shared/ListaDeHoras";
import { campoDaData } from "@/lib/societario/datas";
import { boardPath, trilhaDaLista } from "@/lib/kanbanPaths";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, canManageSector, canActOnSector, podeExcluir } from "@/lib/auth/context";
import { accessiblePipelineWhere } from "@/lib/auth/scope";
import { getSectorUsers } from "@/lib/sectorUsers";
import { formatCalendarDate, formatInstantDate, formatInstantDateTime } from "@/lib/format";
import { duracaoDoLancamento } from "@/lib/horas/edicao";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "Nota",
  STATUS_CHANGE: "Mudança de estágio",
  DOCUMENT: "Documento",
  HANDOFF: "Transferência",
  MENTION: "Menção",
  CREATED: "Atividade criada",
  PRIORITY_CHANGE: "Prioridade alterada",
  DUE_DATE_CHANGE: "Prazo alterado",
  DESCRIPTION_CHANGE: "Descrição alterada",
  ASSIGNEE_CHANGE: "Responsável alterado",
  TAG_CHANGE: "Etiqueta alterada",
  CHECKLIST_CHANGE: "Checklist alterado",
  SUBTASK_CHANGE: "Subatividade alterada",
  COMPLETED: "Atividade concluída",
  REOPENED: "Atividade reaberta",
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
      where: { id, ...accessiblePipelineWhere(ctx) },
      include: {
        stages: { orderBy: { order: "asc" } },
        // Para a trilha da página cheia (setor › espaço › pasta › lista).
        space: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } },
      },
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

  // Excluir card, subtarefa, comentário e item de checklist é só do
  // administrador desde 13/10/2026 — era o gestor do setor (canManageSector).
  // O gestor segue corrigindo o apontamento de tempo de qualquer pessoa.
  const canDelete = podeExcluir(ctx);
  const canManage = canManageSector(ctx, pipeline.sectorCode);
  const canAct = canActOnSector(ctx, pipeline.sectorCode);

  const [entity, activities, sectorTags, sectorUsers, documents, activeTimerUser, otherItems] = await Promise.all([
    !item.entityId
      ? Promise.resolve(null)
      : item.entityType === "COMPANY"
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
    listDocuments(tenantId, "PIPELINE_ITEM", itemId),
    item.activeTimerUserId
      ? prisma.user.findFirst({ where: { id: item.activeTimerUserId }, select: { id: true, name: true } })
      : Promise.resolve(null),
    // Candidatas pra "vincular atividade" / "mencionar atividade no comentário" —
    // qualquer item do mesmo pipeline, exceto o próprio.
    prisma.pipelineItem.findMany({
      where: { pipelineId: id, tenantId, id: { not: itemId } },
      select: { id: true, title: true, entityId: true, entityType: true },
      take: 200,
    }),
  ]);

  const [parentItem, subtasks, checklistItems, mentionUsers, lastCompletion, links, timeEntries] = await Promise.all([
    item.parentItemId
      ? prisma.pipelineItem.findFirst({ where: { id: item.parentItemId, tenantId }, select: { id: true, title: true, entityId: true, entityType: true } })
      : Promise.resolve(null),
    item.parentItemId
      ? Promise.resolve([])
      : prisma.pipelineItem.findMany({
          where: { parentItemId: itemId, tenantId },
          orderBy: { createdAt: "asc" },
          include: { stage: { select: { name: true, color: true, isTerminal: true, type: true } } },
        }),
    prisma.checklistItem.findMany({ where: { pipelineItemId: itemId, tenantId }, orderBy: { order: "asc" } }),
    // @menção em comentário pode citar qualquer usuário do tenant (não só do
    // setor) — mesma regra do autocomplete de Transferências.
    prisma.user.findMany({ where: { tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.activity.findFirst({
      where: { pipelineItemId: itemId, tenantId, type: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    }),
    // Recíproco: item pode ser a origem (pipelineItemId) OU o alvo (linkedItemId)
    // do vínculo — precisa das duas direções pra "Atividades relacionadas" aparecer
    // dos dois lados quando A vincula B.
    prisma.pipelineItemLink.findMany({
      where: { tenantId, OR: [{ pipelineItemId: itemId }, { linkedItemId: itemId }] },
      include: {
        pipelineItem: { select: { id: true, title: true, entityId: true, entityType: true } },
        linkedItem: { select: { id: true, title: true, entityId: true, entityType: true } },
      },
    }),
    // Horas apontadas no card (13/10/2026): a lista com "Editar" — o cronômetro
    // grava aqui, e apagar ficou só com o administrador.
    prisma.timeEntry.findMany({
      where: { tenantId, pipelineItemId: itemId },
      orderBy: [{ loggedOn: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: { id: true, minutes: true, note: true, loggedOn: true, userId: true, user: { select: { name: true } } },
    }),
  ]);

  const currentStage = pipeline.stages.find((s) => s.id === item.stageId);
  const isCompleted = currentStage?.isTerminal ?? false;
  const basePath = boardPath(pipeline);

  // "Outro lado" do vínculo relativo ao item atual — pipelineItem quando o
  // item atual é o alvo (linkedItemId), linkedItem quando é a origem.
  const relatedItems = links.map((l) => (l.pipelineItemId === itemId ? l.linkedItem : l.pipelineItem));

  // Resolve nomes de entidade pras candidatas/links/parent, numa rodada só.
  const entityIdsToResolve = new Set<string>();
  for (const o of otherItems) if (o.entityId) entityIdsToResolve.add(o.entityId);
  for (const r of relatedItems) if (r.entityId) entityIdsToResolve.add(r.entityId);
  const [resolvedCompanies, resolvedPeople] = await Promise.all([
    entityIdsToResolve.size > 0 ? prisma.company.findMany({ where: { id: { in: [...entityIdsToResolve] }, tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
    entityIdsToResolve.size > 0 ? prisma.person.findMany({ where: { id: { in: [...entityIdsToResolve] }, tenantId }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const resolvedNames: Record<string, string> = {};
  for (const c of resolvedCompanies) resolvedNames[c.id] = c.name;
  for (const p of resolvedPeople) resolvedNames[p.id] = p.name;
  function nameFor(o: { title: string | null; entityId: string | null }): string {
    return o.title ?? (o.entityId ? resolvedNames[o.entityId] : null) ?? "(sem título)";
  }

  let parentEntityName: string | null = null;
  if (parentItem) parentEntityName = nameFor(parentItem);

  const deleteAction = excluirItem.bind(null, id, itemId);
  const addNoteAction = adicionarNota.bind(null, id, itemId);
  const editNoteAction = editarNota.bind(null, id, itemId);
  const deleteNoteAction = excluirNota.bind(null, id, itemId);
  const datesAction = atualizarPrazoPrioridade.bind(null, id, itemId);
  const descricaoAction = atualizarDescricao.bind(null, id, itemId);
  const tagToggleAction = alternarTagItem.bind(null, id, itemId);
  const assigneeToggleAction = alternarResponsavelItem.bind(null, id, itemId);
  const watcherToggleAction = alternarObservadorItem.bind(null, id, itemId);

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
  const startTimerAction = iniciarCronometro.bind(null, id, itemId);
  const stopTimerAction = pararCronometro.bind(null, id, itemId);
  const createLinkAction = criarLinkItem.bind(null, id, itemId);
  const deleteLinkAction = removerLinkItem.bind(null, id, itemId);
  const editTimeEntryAction = editarLancamentoTempo.bind(null, id, itemId);
  const deleteTimeEntryAction = excluirLancamentoTempo.bind(null, id, itemId);

  const taskCandidates: TaskMentionCandidate[] = otherItems.map((o) => ({ id: o.id, name: nameFor(o), href: `${basePath}/itens/${o.id}` }));

  // Monta o feed: comentários (NOTE) de topo + eventos, com respostas
  // aninhadas sob cada comentário. Edita o autor (como o `editarNota` exige);
  // exclui só o administrador (13/10/2026).
  function canEditNote(noteUserId: string): boolean {
    return canAct && noteUserId === ctx.userId;
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
      canEdit: a.type === "NOTE" && canEditNote(a.user.id),
      canDelete: a.type === "NOTE" && canDelete,
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
          canEdit: canEditNote(r.user.id),
          canDelete,
        })),
    }));

  const title = item.title ?? entity?.name ?? "(removido)";
  // Sem breadcrumb = dentro do modal (KanbanItemModal já reserva uma altura
  // fixa pro painel) — nesse caso o cabeçalho fica fixo e só o corpo (grid de
  // duas colunas) ocupa o espaço restante, permitindo que cada coluna role de
  // forma independente em vez de uma rolagem única do modal inteiro (que
  // obrigava rolar até o fim só pra alcançar a caixa de comentário).
  const isModal = !showBreadcrumb;
  const nomeDoSetor = showBreadcrumb
    ? ((await getSectorMaps(tenantId)).labels[pipeline.sectorCode] ?? pipeline.sectorCode)
    : pipeline.sectorCode;

  return (
    <div className={isModal ? "flex flex-col h-full min-h-0" : undefined}>
      {/* A trilha pelo `Breadcrumb` compartilhado (07/10/2026) — era escrita à
          mão. No caminho que a lista mostra, e não a partir de "Kanban" (15/10/2026). */}
      {showBreadcrumb && (
        <Breadcrumb className="mb-4!" items={[...trilhaDaLista(pipeline, nomeDoSetor), { label: title, truncate: true }]} />
      )}

      {/* No modal, o "Excluir tarefa" fica no canto, na mesma linha e altura do
          fechar (`top-4`, h-8, do `KanbanItemModal`). Ao lado do título, ele
          descia junto com a primeira linha do título grande e ficava torto em
          relação ao X (Ajustes de 27/10/2026). */}
      {isModal && canDelete && (
        <div className="absolute top-4 right-14 z-10 flex h-8 items-center">
          <DeleteTaskButton entityName={title} deleteAction={deleteAction} />
        </div>
      )}

      <div className={isModal ? (canDelete ? "mb-3 pr-40" : "mb-3 pr-12") : "mb-3"}>
        {item.parentItemId && (
          <Link
            href={`${basePath}/itens/${item.parentItemId}`}
            className="text-fs-2 text-fg-muted hover:text-fg transition-colors inline-block mb-1"
          >
            ← Subtarefa de &quot;{parentEntityName}&quot;
          </Link>
        )}
        <div className="flex items-start justify-between gap-3">
          {/* O `id` dá nome ao modal da tarefa (`KanbanItemModal`): o leitor de
              tela anunciava "Detalhe do item" para toda tarefa. */}
          <h1 id="titulo-da-tarefa" className="text-display leading-tight font-bold text-fg tracking-[-0.015em] mb-1">
            {title}
          </h1>
          {!isModal && canDelete && <DeleteTaskButton entityName={title} deleteAction={deleteAction} />}
        </div>
        {/* "Ver ficha completa" era link azul (30/09): botão não é link. O nome
            da empresa/pessoa segue ao lado quando a tarefa tem título próprio. */}
        {entity && (
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {item.title && <span className="text-fs-3 text-fg-muted">{entity.name}</span>}
            <Button
              href={item.entityType === "COMPANY" ? `/empresas/${entity.id}` : `/pessoas/${entity.id}`}
              variant="secondary"
              size="xs"
            >
              Ver ficha completa <ArrowRight size={11} />
            </Button>
          </div>
        )}
      </div>

      <CompletionBanner
        canAct={canAct}
        isCompleted={isCompleted}
        completedByLabel={
          isCompleted && lastCompletion
            ? `Concluída em ${formatInstantDate(lastCompletion.createdAt)} por ${lastCompletion.user.name}`
            : isCompleted
              ? "Atividade concluída"
              : null
        }
        concluirAction={concluirAction}
        reabrirAction={reabrirAction}
      />

      <div
        // Coluna de comentários de 380px → 420px: a barra de rolagem do feed
        // encostava no texto das mensagens e no campo de comentário.
        className={`grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4 items-stretch ${
          isModal ? "flex-1 min-h-0 lg:[grid-template-rows:minmax(0,1fr)]" : ""
        }`}
      >
        <div className={`flex flex-col gap-4 min-w-0 ${isModal ? "lg:overflow-y-auto lg:min-h-0" : ""}`}>
          <TaskFieldsPanel
            canAct={canAct}
            itemId={itemId}
            stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, type: s.type }))}
            currentStageId={item.stageId}
            moveAction={moverItem}
            dueDate={item.dueDate ? item.dueDate.toISOString() : null}
            startDate={item.startDate ? item.startDate.toISOString() : null}
            recurring={item.recurring}
            recurrenceFrequency={item.recurrenceFrequency}
            priority={item.priority}
            datesAction={datesAction}
            estimateMinutes={item.estimateMinutes}
            estimateAction={estimateAction}
            activeTimer={item.activeTimerUserId && item.activeTimerStartedAt ? {
              userId: item.activeTimerUserId,
              userName: activeTimerUser?.name ?? "Alguém",
              startedAt: item.activeTimerStartedAt.toISOString(),
            } : null}
            currentUserId={ctx.userId}
            startTimerAction={startTimerAction}
            stopTimerAction={stopTimerAction}
            allTags={sectorTags}
            selectedTagIds={item.tags.map((t) => t.tagId)}
            tagToggleAction={tagToggleAction}
            allUsers={sectorUsers}
            selectedUserIds={item.assignees.map((a) => a.userId)}
            assigneeToggleAction={assigneeToggleAction}
            selectedWatcherIds={item.watchers.map((w) => w.userId)}
            watcherToggleAction={watcherToggleAction}
          />

          <DescriptionEditor canAct={canAct} description={item.description} action={descricaoAction} />

          {/* Rodapé do detalhamento — as seções em blocos recolhíveis, que
              começam fechados com o resumo na linha (15/10/2026). Cada uma só
              aparece se tiver conteúdo ou se o usuário puder criar algo ali. */}
          <div className="flex flex-col gap-2">
            {!item.parentItemId && (subtasks.length > 0 || canAct) && (
              <DetailSection
                title="Subatividades"
                summary={
                  subtasks.length > 0
                    ? `${subtasks.filter((s) => s.stage.isTerminal).length}/${subtasks.length}`
                    : undefined
                }
              >
                <SubtasksSection
                  canAct={canAct}
                  canDelete={canDelete}
                  basePath={basePath}
                  pipelineId={id}
                  subtasks={subtasks.map((s) => ({
                    id: s.id,
                    title: s.title ?? "(sem título)",
                    stageName: s.stage.name,
                    stageColor: s.stage.color,
                    isTerminal: s.stage.isTerminal,
                    stageType: s.stage.type,
                    priority: s.priority,
                  }))}
                  createAction={createSubtaskAction}
                  deleteAction={deleteSubtaskAction}
                  concluirAction={concluirTarefa}
                  reabrirAction={reabrirTarefa}
                />
              </DetailSection>
            )}

            {(relatedItems.length > 0 || canAct) && (
              <DetailSection
                title="Atividades relacionadas"
                summary={relatedItems.length > 0 ? relatedItems.length : undefined}
              >
                <LinkedItemsSection
                  canAct={canAct}
                  basePath={basePath}
                  links={relatedItems.map((r) => ({ id: r.id, name: nameFor(r) }))}
                  candidates={taskCandidates}
                  createAction={createLinkAction}
                  deleteAction={deleteLinkAction}
                />
              </DetailSection>
            )}

            {(checklistItems.length > 0 || canAct) && (
              <DetailSection
                title="Checklist"
                summary={
                  checklistItems.length > 0
                    ? `${checklistItems.filter((c) => c.done).length}/${checklistItems.length}`
                    : undefined
                }
              >
                <ChecklistSection
                  canAct={canAct}
                  canDelete={canDelete}
                  items={checklistItems.map((c) => ({ id: c.id, text: c.text, done: c.done }))}
                  createAction={createChecklistAction}
                  toggleAction={toggleChecklistAction}
                  editAction={editChecklistAction}
                  deleteAction={deleteChecklistAction}
                  reorderAction={reorderChecklistAction}
                />
              </DetailSection>
            )}

            {(documents.length > 0 || canAct) && (
              <DetailSection title="Anexos" summary={documents.length > 0 ? documents.length : undefined}>
                <TaskAttachmentsSection
                  entityId={itemId}
                  canUpload={canAct}
                  documents={documents.map((d) => ({
                    id: d.id,
                    fileName: d.fileName,
                    category: d.category,
                    sensitive: d.sensitive,
                    uploadedByName: d.uploadedBy.name,
                    uploadedByPhotoUrl: d.uploadedBy.photoUrl,
                    createdAtLabel: formatInstantDate(d.createdAt),
                    expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
                    expired: d.expiresAt != null && d.expiresAt < new Date(),
                  }))}
                />
              </DetailSection>
            )}

            {timeEntries.length > 0 && (
              <DetailSection
                title="Horas apontadas"
                summary={duracaoDoLancamento(timeEntries.reduce((s, t) => s + t.minutes, 0))}
              >
                <ListaDeHoras
                  linhas={timeEntries.map((t) => ({
                    id: t.id,
                    quem: t.user.name,
                    minutos: t.minutes,
                    dia: formatInstantDate(t.loggedOn),
                    diaDoCampo: campoDaData(t.loggedOn),
                    nota: t.note,
                    podeEditar: canAct && (t.userId === ctx.userId || canManage),
                    podeExcluir: canDelete,
                  }))}
                  editar={editTimeEntryAction}
                  excluir={deleteTimeEntryAction}
                />
              </DetailSection>
            )}
          </div>
        </div>
        <ActivityFeed
          items={feedItems}
          canAct={canAct}
          mentionUsers={mentionUsers}
          pipelineItemId={itemId}
          taskCandidates={taskCandidates}
          addNoteAction={addNoteAction}
          editAction={editNoteAction}
          deleteAction={deleteNoteAction}
        />
      </div>
    </div>
  );
}
