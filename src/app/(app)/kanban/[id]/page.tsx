import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { BoardView } from "@/components/kanban/BoardView";
import { BotaoNovaTarefa } from "@/components/kanban/NovaTarefaEmLinha";
import { DuplicatePipelineButton } from "@/components/kanban/DuplicatePipelineButton";
import { EditPipelineStagesModal } from "@/components/kanban/EditPipelineStagesModal";
import { PageContainer } from "@/components/shared/PageContainer";
import { moverItem, reposicionarItem, duplicarPipeline, renomearEstagio, atualizarEstagios, criarTarefaRapida, criarSubtarefa, atualizarPrioridadeResponsavel, concluirTarefa, reabrirTarefa, excluirItem } from "../actions";
import { contarFilhas, montarArvore, type NoDaArvore } from "@/lib/kanban/subatividades";
import type { SubtaskRow } from "@/components/kanban/TaskListView";
import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { poderesNaLista } from "@/lib/kanban/permissaoDoEspacoServidor";
import { accessiblePipelineWhere, scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";

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
    where: { id, ...accessiblePipelineWhere(ctx) },
    include: {
      space: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      stages: { orderBy: { order: "asc" } },
      // Todos os níveis numa leitura só (06/11/2026): a árvore se monta aqui
      // embaixo. Subatividade não vira card solto no Kanban nem linha de topo
      // na Lista — aparece dentro do pai, nível a nível.
      items: {
        include: {
          stage: { select: { name: true, isTerminal: true } },
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
          assignees: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (!pipeline) notFound();

  // Criar, mover e editar: quem edita no espaço da lista (05/11/2026).
  const canAddItem = (await poderesNaLista(ctx, pipeline)).editar;
  // Excluir card e tirar coluna: só o administrador (13/10/2026).
  const canDelete = podeExcluir(ctx);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const duplicateEntities =
    pipeline.entityType === "COMPANY"
      ? (await prisma.company.findMany({ where: await scopedCompanyWhere(ctx), orderBy: { name: "asc" }, select: { id: true, name: true } }))
      : (await prisma.person.findMany({ where: await scopedPersonWhere(ctx), orderBy: { name: "asc" }, select: { id: true, name: true } }));

  // Resolve nomes das entidades (Company ou Person) referenciadas pelos itens
  // — nem todo item tem entidade (tarefa sem empresa/pessoa associada).
  // A subatividade herda a empresa/pessoa do pai: sem repetir o id na busca.
  const entityIds = [...new Set(pipeline.items.map((i) => i.entityId).filter((v): v is string => v != null))];
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
  type No = NoDaArvore<(typeof pipeline.items)[number]>;
  const nomeDe = (i: No) => i.title ?? (i.entityId ? entityNames[i.entityId] : null) ?? "(sem título)";
  // A subatividade, em qualquer nível, com as filhas dela já dentro.
  const subatividade = (s: No): SubtaskRow => ({
    id: s.id,
    stageId: s.stageId,
    entityName: nomeDe(s),
    stageName: s.stage.name,
    isTerminal: s.stage.isTerminal,
    priority: s.priority,
    dueDate: s.dueDate ? s.dueDate.toISOString() : null,
    recurring: s.recurring,
    tags: s.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    assignees: s.assignees.map((a) => ({ id: a.user.id, name: a.user.name, priority: a.priority })),
    subtasks: s.filhas.map(subatividade),
  });
  const items = montarArvore(pipeline.items).map((i) => {
    // O "x/y" do card do Kanban: as filhas diretas, como o contador da Lista.
    const filhas = contarFilhas(i, (f) => f.stage.isTerminal);
    return {
      id: i.id,
      stageId: i.stageId,
      entityName: nomeDe(i),
      priority: i.priority,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      tags: i.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      assignees: i.assignees.map((a) => ({ id: a.user.id, name: a.user.name, priority: a.priority })),
      recurring: i.recurring,
      daysInStage: daysSince(lastChangeByItem[i.id] ?? i.createdAt),
      lastActivity: lastActivityByItem[i.id] ?? null,
      description: i.description,
      creator: creatorByItem[i.id] ?? null,
      subtaskTotal: filhas.total,
      subtaskDone: filhas.concluidas,
      subtasks: i.filhas.map(subatividade),
    };
  });

  return (
    <PageContainer className="h-full flex flex-col">
      {/* A trilha pelo `Breadcrumb` compartilhado (07/10/2026) — era escrita à
          mão. Ele já quebra linha: com setor, espaço, pasta e lista, a trilha
          estourava a largura no celular. */}
      <Breadcrumb
        className="mb-1!"
        items={[
          { label: sectorLabels[pipeline.sectorCode] ?? pipeline.sectorCode, href: `/setor/${pipeline.sectorCode}` },
          { label: pipeline.space.name, href: `/setor/${pipeline.sectorCode}/espacos/${pipeline.space.id}`, truncate: true },
          ...(pipeline.folder
            ? [{ label: pipeline.folder.name, href: `/setor/${pipeline.sectorCode}/pastas/${pipeline.folder.id}`, truncate: true }]
            : []),
          { label: pipeline.name },
        ]}
      />

      <PageHeader
        title={pipeline.name}
        subtitle={
          <>
            {sectorLabels[pipeline.sectorCode] ?? pipeline.sectorCode} ·{" "}
            {pipeline.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
          </>
        }
        action={
          canAddItem && (
          <div className="flex items-center gap-2">
            <EditPipelineStagesModal
              initialStages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, color: s.color ?? "#586577", type: s.isTerminal ? "DONE" : s.type === "DONE" ? "NOT_STARTED" : s.type }))}
              action={atualizarEstagios.bind(null, id)}
              podeExcluirColuna={canDelete}
            />
            {duplicateEntities.length > 0 && (
              <DuplicatePipelineButton
                action={duplicarPipeline.bind(null, id)}
                entities={duplicateEntities}
                entityLabel={pipeline.entityType === "COMPANY" ? "Empresa" : "Pessoa"}
                defaultName={`${pipeline.name} — cópia`}
              />
            )}
            {/* Sem formulário (05/11/2026): abre o campo em linha na primeira coluna. */}
            <BotaoNovaTarefa />
          </div>
          )
        }
      />

      <div className="flex-1 min-h-0">
        <BoardView
          pipelineId={id}
          basePath={`/kanban/${id}`}
          stages={pipeline.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, isTerminal: s.isTerminal, type: s.type }))}
          items={items}
          canAct={canAddItem}
          moveAction={moverItem}
          repositionAction={reposicionarItem}
          renameStageAction={renomearEstagio.bind(null, id)}
          createTaskAction={criarTarefaRapida.bind(null, id)}
          createSubtaskAction={criarSubtarefa}
          priorityAction={atualizarPrioridadeResponsavel.bind(null, id)}
          concluirAction={concluirTarefa}
          reabrirAction={reabrirTarefa}
          deleteAction={canDelete ? excluirItem.bind(null, id) : undefined}
        />
      </div>
    </PageContainer>
  );
}
