import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { carregarQuadro, type ItemDoQuadro } from "@/lib/kanban/carregarQuadro";
import { lerLimiteDeConcluidas } from "@/lib/kanban/concluidasDoQuadro";
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ concluidas?: string | string[] }>;
}) {
  const { id } = await params;
  const limiteDeConcluidas = lerLimiteDeConcluidas((await searchParams).concluidas);
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  // Só o que a tela mostra (10/11/2026): abertos inteiros, das colunas
  // concluídas as mais recentes, subatividades só abaixo do que veio — ver
  // `carregarQuadro`. A árvore se monta aqui embaixo, como desde 06/11/2026.
  const quadro = await carregarQuadro({
    tenantId: ctx.tenantId,
    where: { id, ...accessiblePipelineWhere(ctx) },
    limiteDeConcluidas,
  });

  if (!quadro) notFound();
  const { pipeline, itens: carregados, concluidas, ultimaMudancaDeEtapa, ultimaAtividade, criador } = quadro;

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
  const entityIds = [...new Set(carregados.map((i) => i.entityId).filter((v): v is string => v != null))];
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

  type No = NoDaArvore<ItemDoQuadro>;
  const nomeDe = (i: No) => i.title ?? (i.entityId ? entityNames[i.entityId] : null) ?? "(sem título)";
  // A subatividade, em qualquer nível, com as filhas dela já dentro.
  const subatividade = (s: No): SubtaskRow => ({
    id: s.id,
    // O número: o card abre pelo endereço curto, tarefa-77 (10/11/2026).
    number: s.number,
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
  const items = montarArvore(carregados).map((i) => {
    // O "x/y" do card do Kanban: as filhas diretas, como o contador da Lista.
    const filhas = contarFilhas(i, (f) => f.stage.isTerminal);
    return {
      id: i.id,
      number: i.number,
      stageId: i.stageId,
      entityName: nomeDe(i),
      priority: i.priority,
      dueDate: i.dueDate ? i.dueDate.toISOString() : null,
      tags: i.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      assignees: i.assignees.map((a) => ({ id: a.user.id, name: a.user.name, priority: a.priority })),
      recurring: i.recurring,
      daysInStage: daysSince(ultimaMudancaDeEtapa[i.id] ?? i.createdAt),
      lastActivity: ultimaAtividade[i.id] ?? null,
      description: i.description,
      creator: criador[i.id] ?? null,
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
          concluidas={concluidas}
          limiteDeConcluidas={limiteDeConcluidas}
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
