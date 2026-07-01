import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { MoveStageSelect } from "@/components/pipelines/MoveStageSelect";
import { AddNoteForm } from "@/components/pipelines/AddNoteForm";
import { DeleteButton } from "@/components/pipelines/DeleteButton";
import { moverItem, adicionarNota, excluirItem } from "../../../actions";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "Nota",
  STATUS_CHANGE: "Mudança de estágio",
  DOCUMENT: "Documento",
  HANDOFF: "Handoff",
  MENTION: "Menção",
};

export default async function PipelineItemPage({
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
    prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } }),
  ]);

  if (!pipeline || !item) notFound();

  const canDelete = canManageSector(ctx, pipeline.sectorCode);
  const canAct = canActOnSector(ctx, pipeline.sectorCode);

  const entity =
    item.entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } })
      : await prisma.person.findFirst({ where: { id: item.entityId, tenantId }, select: { id: true, name: true } });

  const activities = await prisma.activity.findMany({
    where: { pipelineItemId: itemId, tenantId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });

  const deleteAction = excluirItem.bind(null, id, itemId);
  const addNoteAction = adicionarNota.bind(null, id, itemId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pipelines" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pipelines
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/pipelines/${id}`}
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

      {/* Estágio */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Estágio</h2>
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

      {/* Timeline */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">Atividades</h2>

        {canAct && (
          <div className="mb-4">
            <AddNoteForm action={addNoteAction} />
          </div>
        )}

        {activities.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhuma atividade registrada ainda.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a) => (
              <div key={a.id} className="border-l-2 border-border pl-3 py-0.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-medium text-fg-secondary">
                    {ACTIVITY_LABEL[a.type] ?? a.type}
                  </span>
                  <span className="text-[11px] text-fg-muted">·</span>
                  <span className="text-[11px] text-fg-muted">{a.user.name}</span>
                  <span className="text-[11px] text-fg-muted">·</span>
                  <span className="text-[11px] text-fg-muted tnum">
                    {a.createdAt.toLocaleString("pt-BR")}
                  </span>
                </div>
                {a.content && <p className="text-[13px] text-fg">{a.content}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
