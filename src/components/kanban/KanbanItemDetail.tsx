import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CardActionBar } from "@/components/kanban/CardActionBar";
import { DescriptionEditor } from "@/components/kanban/DescriptionEditor";
import { ActivityFeed, type FeedItem } from "@/components/kanban/ActivityFeed";
import { MeetingsSection } from "@/components/kanban/MeetingsSection";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { listDocuments } from "@/lib/documents";
import {
  moverItem,
  adicionarNota,
  excluirItem,
  atualizarPrazoPrioridade,
  atualizarDescricao,
  alternarTagItem,
  alternarResponsavelItem,
} from "@/app/(app)/kanban/actions";
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
};

const IMPORTANT_ACTIVITY_TYPES = new Set([
  "STATUS_CHANGE", "HANDOFF", "CREATED", "PRIORITY_CHANGE", "DUE_DATE_CHANGE", "ASSIGNEE_CHANGE", "DOCUMENT",
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
      include: { user: { select: { name: true } } },
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

  const deleteAction = excluirItem.bind(null, id, itemId);
  const addNoteAction = adicionarNota.bind(null, id, itemId);
  const prazoAction = atualizarPrazoPrioridade.bind(null, id, itemId);
  const descricaoAction = atualizarDescricao.bind(null, id, itemId);
  const tagToggleAction = alternarTagItem.bind(null, id, itemId);
  const assigneeToggleAction = alternarResponsavelItem.bind(null, id, itemId);
  const scheduleMeetingAction = agendarReuniao.bind(null, id, itemId);
  const deleteMeetingAction = excluirReuniao.bind(null, id);
  const hasGoogle = oauthAccounts.some((a) => a.provider === "GOOGLE");
  const hasMicrosoft = oauthAccounts.some((a) => a.provider === "MICROSOFT");

  const feedItems: FeedItem[] = activities.map((a) => ({
    id: a.id,
    type: a.type,
    label: ACTIVITY_LABEL[a.type] ?? a.type,
    createdAtLabel: formatInstantDateTime(a.createdAt),
    userName: a.user.name,
    content: a.content,
    importante: IMPORTANT_ACTIVITY_TYPES.has(a.type),
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
          <span className="text-[13px] text-fg truncate">{entity?.name ?? "(removido)"}</span>
        </div>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
        <div className="flex flex-col gap-4 min-w-0">
          <DescriptionEditor canAct={canAct} description={item.description} action={descricaoAction} />
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
        <ActivityFeed items={feedItems} canAct={canAct} addNoteAction={addNoteAction} />
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
