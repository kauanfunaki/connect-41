"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PipelineEntityType, ActivityType, RecurringFrequency, StageType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";
import { boardPath } from "@/lib/kanbanPaths";
import { findMentionedUserIds } from "@/lib/handoffMentions";
import { notifyUser } from "@/lib/notifications";
import { sanitizeDocumentHtml } from "@/lib/clientDocuments";

export type PipelineState = { error: string } | null;

// Destinatários "de interesse" de um item — responsáveis + participantes
// (watchers). Usado pra notificar quem acompanha a tarefa quando entra um
// comentário novo, sem incluir o próprio autor da ação.
async function interestedUserIds(pipelineItemId: string, excludeUserId: string): Promise<string[]> {
  const prisma = getPrisma();
  const [assignees, watchers] = await Promise.all([
    prisma.pipelineItemAssignee.findMany({ where: { pipelineItemId }, select: { userId: true } }),
    prisma.pipelineItemWatcher.findMany({ where: { pipelineItemId }, select: { userId: true } }),
  ]);
  const ids = new Set<string>();
  for (const a of assignees) ids.add(a.userId);
  for (const w of watchers) ids.add(w.userId);
  ids.delete(excludeUserId);
  return [...ids];
}

export async function criarPipeline(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  const sectorCode = (form.get("sectorCode") as string)?.trim();
  const entityType = form.get("entityType") as PipelineEntityType;

  if (!name) return { error: "Nome do kanban é obrigatório" };
  if (!sectorCode) return { error: "Setor é obrigatório" };
  if (!canManageSector(ctx, sectorCode)) {
    return { error: "Sem permissão para criar kanban neste setor." };
  }

  const stageNames = form.getAll("stageName") as string[];
  const stageColors = form.getAll("stageColor") as string[];
  const stages = stageNames
    .map((n, i) => ({ name: n.trim(), color: stageColors[i] || null }))
    .filter((s) => s.name);

  if (stages.length === 0) return { error: "Adicione ao menos um estágio" };

  const prisma = getPrisma();
  let id: string;

  try {
    // Toda Lista precisa de um Espaço (estrutura Espaço → Pasta → Lista) — o
    // formulário genérico de criação de kanban ainda não pede espaço
    // explicitamente, então reaproveita/cria um espaço padrão (nome = code do
    // setor) pra não travar esse fluxo enquanto a navegação por Espaço não
    // chega nos demais setores.
    let space = await prisma.space.findFirst({ where: { tenantId, sectorCode, name: sectorCode } });
    if (!space) {
      space = await prisma.space.create({ data: { tenantId, sectorCode, name: sectorCode } });
    }

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        name,
        sectorCode,
        spaceId: space.id,
        entityType,
        stages: {
          create: stages.map((s, i) => ({
            name: s.name,
            color: s.color,
            order: i,
            isTerminal: i === stages.length - 1,
            type: i === stages.length - 1 ? StageType.DONE : StageType.NOT_STARTED,
          })),
        },
      },
    });
    id = pipeline.id;
  } catch (err) {
    console.error("[criarPipeline]", err);
    return { error: "Erro ao criar kanban. Tente novamente." };
  }

  redirect(boardPath({ id, sectorCode }));
}

export async function criarItem(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const pipelineId = form.get("pipelineId") as string;
  const entityType = (form.get("entityType") as string)?.trim() || null;
  const entityId = (form.get("entityId") as string)?.trim() || null;
  const title = (form.get("title") as string)?.trim() || null;
  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();
  const descriptionRaw = (form.get("description") as string)?.trim();

  // Empresa/pessoa é opcional (nem toda tarefa está associada a uma) — mas
  // sem entidade, o título vira obrigatório (é o que identifica a tarefa).
  if (!entityId && !title) return { error: "Selecione uma empresa/pessoa ou informe um título" };

  const tagIds = form.getAll("tags") as string[];
  const assigneeIds = form.getAll("assignees") as string[];

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, ...scopedPipelineWhere(ctx) } });
  if (!pipeline) return { error: "Kanban não encontrado ou fora do seu escopo." };
  if (!canManageSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para adicionar itens neste setor." };
  }

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return { error: "Kanban sem estágios configurados" };

    const item = await prisma.pipelineItem.create({
      data: {
        tenantId,
        pipelineId,
        stageId: firstStage.id,
        entityType: entityType as PipelineEntityType | null,
        entityId,
        title,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        priority: priorityRaw ? parseInt(priorityRaw) : 0,
        description: descriptionRaw ? descriptionRaw : null,
        tags: tagIds.length > 0 ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        assignees: assigneeIds.length > 0 ? { create: assigneeIds.map((userId) => ({ userId })) } : undefined,
      },
    });

    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: item.id, userId, type: ActivityType.CREATED, content: `Criado em "${firstStage.name}"` },
      });
    }
  } catch (err) {
    console.error("[criarItem]", err);
    return { error: "Erro ao adicionar item. Tente novamente." };
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  redirect(base);
}

// Criação rápida — só o título, sem entidade/prazo/prioridade/responsável.
// Usada pelo botão "+ Adicionar Tarefa" da visão em lista; o resto se
// configura depois no detalhe da tarefa.
export async function criarTarefaRapida(pipelineId: string, stageId: string, title: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const trimmed = title.trim();
  if (!tenantId || !trimmed) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, ...scopedPipelineWhere(ctx) } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  const stage = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId } });
  if (!stage) return;

  try {
    const item = await prisma.pipelineItem.create({
      data: { tenantId, pipelineId, stageId, title: trimmed },
    });
    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: item.id, userId, type: ActivityType.CREATED, content: `Criado em "${stage.name}"` },
      });
    }
  } catch (err) {
    console.error("[criarTarefaRapida]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

// Renomear estágio direto na visão em lista (clique no cabeçalho do status).
export async function renomearEstagio(pipelineId: string, stageId: string, name: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  const trimmed = name.trim();
  if (!tenantId || !trimmed) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  try {
    await prisma.pipelineStage.update({ where: { id: stageId, pipelineId }, data: { name: trimmed } });
  } catch (err) {
    console.error("[renomearEstagio]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

export type StageInput = { id?: string; name: string; color: string; type: StageType };
export type EditStagesState = { error: string } | null;

// CRUD completo de estágios de uma lista (editar nome/cor/tipo, criar, excluir,
// reordenar), usado pelo modal "Editar lista". Recebe a lista final desejada
// de estágios (com id pros existentes, sem id pros novos) e reconcilia com o
// banco numa transação — reorder em duas fases (temp negativo -> final) pra
// não colidir com a constraint única (pipelineId, order).
export async function atualizarEstagios(pipelineId: string, stages: StageInput[]): Promise<EditStagesState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const cleaned = stages.map((s) => ({ ...s, name: s.name.trim() })).filter((s) => s.name);
  if (cleaned.length === 0) return { error: "Adicione ao menos um estágio" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return { error: "Kanban não encontrado." };
  if (!canManageSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para editar esta lista." };
  }

  const existing = await prisma.pipelineStage.findMany({
    where: { pipelineId },
    include: { _count: { select: { items: true } } },
  });

  const keptIds = new Set(cleaned.map((s) => s.id).filter((id): id is string => !!id));
  const removed = existing.filter((s) => !keptIds.has(s.id));
  const removedWithItems = removed.filter((s) => s._count.items > 0);
  if (removedWithItems.length > 0) {
    return { error: `Mova as tarefas de "${removedWithItems[0].name}" antes de excluir esse estágio.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const s of removed) {
        await tx.pipelineStage.delete({ where: { id: s.id } });
      }
      // Fase 1: joga todo mundo pra uma faixa negativa temporária, pra não
      // colidir com @@unique([pipelineId, order]) ao trocar posições.
      await tx.pipelineStage.updateMany({
        where: { pipelineId, id: { in: [...keptIds] } },
        data: { order: { decrement: 100000 } },
      });
      for (let i = 0; i < cleaned.length; i++) {
        const s = cleaned[i];
        const isTerminal = s.type === StageType.DONE;
        if (s.id) {
          await tx.pipelineStage.update({
            where: { id: s.id, pipelineId },
            data: { name: s.name, color: s.color, type: s.type, isTerminal, order: i },
          });
        } else {
          await tx.pipelineStage.create({
            data: { pipelineId, name: s.name, color: s.color, type: s.type, isTerminal, order: i },
          });
        }
      }
    });
  } catch (err) {
    console.error("[atualizarEstagios]", err);
    return { error: "Erro ao salvar a lista. Tente novamente." };
  }

  revalidatePath(boardPath(pipeline));
  return null;
}

export async function moverItem(
  itemId: string,
  newStageId: string
): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return;
    if (item.stageId === newStageId) return; // reordenar dentro da mesma coluna — sem mudança de estágio, não registra atividade

    const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
    if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

    const [fromStage, toStage] = await Promise.all([
      prisma.pipelineStage.findUnique({ where: { id: item.stageId } }),
      prisma.pipelineStage.findUnique({ where: { id: newStageId } }),
    ]);

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { stageId: newStageId },
    });

    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.STATUS_CHANGE,
        content: `Movido de "${fromStage?.name ?? "?"}" para "${toStage?.name ?? "?"}"`,
        metadata: { stageFrom: fromStage?.id, stageTo: toStage?.id },
      },
    });

    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  } catch (err) {
    console.error("[moverItem]", err);
  }
}

// Reordenar dentro do mesmo status (mesmo estágio + mesmo pai, se for
// subtarefa) — troca adjacente, mesmo mecanismo do reordenarChecklistItem.
export async function reordenarItem(itemId: string, direction: "up" | "down"): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return;

    const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
    if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

    const siblings = await prisma.pipelineItem.findMany({
      where: { tenantId, pipelineId: item.pipelineId, stageId: item.stageId, parentItemId: item.parentItemId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    const index = siblings.findIndex((i) => i.id === itemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= siblings.length) return;

    const a = siblings[index];
    const b = siblings[swapIndex];
    await prisma.$transaction([
      prisma.pipelineItem.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.pipelineItem.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);

    revalidatePath(boardPath(pipeline));
  } catch (err) {
    console.error("[reordenarItem]", err);
  }
}

export async function adicionarNota(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const content = (form.get("content") as string)?.trim();
  if (!content) return { error: "Escreva uma nota" };

  // parentActivityId opcional — presente quando a nota é resposta a outra.
  const parentActivityId = (form.get("parentActivityId") as string)?.trim() || null;

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para registrar atividade neste setor." };
  }

  // Resposta só é válida se apontar pra um comentário (NOTE) do mesmo item.
  let validParentId: string | null = null;
  if (parentActivityId) {
    const parent = await prisma.activity.findFirst({
      where: { id: parentActivityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
      select: { id: true },
    });
    validParentId = parent?.id ?? null;
  }

  const item = await prisma.pipelineItem.findFirst({
    where: { id: itemId, tenantId },
    select: { entityType: true, entityId: true, title: true },
  });

  try {
    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.NOTE,
        content,
        parentActivityId: validParentId,
      },
    });
  } catch (err) {
    console.error("[adicionarNota]", err);
    return { error: "Erro ao adicionar nota." };
  }

  // Notificações: mencionados (@Nome) + interessados (responsáveis/participantes),
  // sem duplicar e sem notificar o próprio autor. Menção é o sinal mais forte,
  // então tem prioridade quando o usuário é mencionado E interessado.
  if (item) {
    const notifyEntity = item.entityType && item.entityId ? { entityType: item.entityType, entityId: item.entityId } : {};
    const taskLabel = item.title ?? "tarefa";
    const mentioned = await findMentionedUserIds(tenantId, [content]);
    const mentionedSet = new Set(mentioned);
    mentionedSet.delete(userId);

    for (const uid of mentionedSet) {
      await notifyUser(uid, {
        tenantId, type: "MENTION", message: `Você foi mencionado em um comentário (${taskLabel}).`, ...notifyEntity,
      });
    }

    const interested = await interestedUserIds(itemId, userId);
    for (const uid of interested) {
      if (mentionedSet.has(uid)) continue; // já notificado pela menção
      await notifyUser(uid, {
        tenantId, type: "COMMENT", message: `Novo comentário em ${taskLabel}.`, ...notifyEntity,
      });
    }
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
  return null;
}

export async function editarNota(pipelineId: string, itemId: string, activityId: string, content: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId || !content.trim()) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return;

  // Só o próprio autor edita a própria nota (independe de canManage).
  const note = await prisma.activity.findFirst({
    where: { id: activityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
    select: { userId: true },
  });
  if (!note || note.userId !== userId) return;

  try {
    await prisma.activity.update({ where: { id: activityId }, data: { content: content.trim(), editedAt: new Date() } });
  } catch (err) {
    console.error("[editarNota]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function excluirNota(pipelineId: string, itemId: string, activityId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return;

  const note = await prisma.activity.findFirst({
    where: { id: activityId, pipelineItemId: itemId, tenantId, type: ActivityType.NOTE },
    select: { userId: true },
  });
  // Autor apaga a própria nota; coordenador (canManage) apaga qualquer nota.
  if (!note || (note.userId !== userId && !canManageSector(ctx, pipeline.sectorCode))) return;

  try {
    await prisma.activity.delete({ where: { id: activityId } });
  } catch (err) {
    console.error("[excluirNota]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function alternarObservadorItem(pipelineId: string, itemId: string, userId: string, marcado: boolean): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    if (marcado) {
      await prisma.pipelineItemWatcher.upsert({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
        create: { pipelineItemId: itemId, userId },
        update: {},
      });
    } else {
      await prisma.pipelineItemWatcher.delete({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      });
    }
  } catch (err) {
    console.error("[alternarObservadorItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };

function formatDueDateLabel(d: Date | null): string {
  if (!d) return "sem prazo";
  return d.toISOString().slice(0, 10).split("-").reverse().join("/");
}

export async function atualizarPrazoPrioridade(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para editar este item." };
  }

  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const startDateRaw = (form.get("startDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();
  const recurring = form.get("recurring") === "true";
  const frequencyRaw = (form.get("recurrenceFrequency") as string)?.trim();
  const newDueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const newStartDate = startDateRaw ? new Date(startDateRaw) : null;
  const newPriority = priorityRaw ? parseInt(priorityRaw) : 0;
  const newFrequency: RecurringFrequency | null =
    recurring && ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"].includes(frequencyRaw) ? (frequencyRaw as RecurringFrequency) : null;

  try {
    const before = await prisma.pipelineItem.findUnique({
      where: { id: itemId },
      select: { dueDate: true, priority: true },
    });

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: {
        dueDate: newDueDate,
        startDate: newStartDate,
        priority: newPriority,
        recurring,
        recurrenceFrequency: newFrequency,
      },
    });

    if (userId && before) {
      const beforeDue = before.dueDate ? before.dueDate.getTime() : null;
      const afterDue = newDueDate ? newDueDate.getTime() : null;
      if (beforeDue !== afterDue) {
        await prisma.activity.create({
          data: {
            tenantId, pipelineItemId: itemId, userId, type: ActivityType.DUE_DATE_CHANGE,
            content: `Prazo alterado de ${formatDueDateLabel(before.dueDate)} para ${formatDueDateLabel(newDueDate)}`,
          },
        });
      }
      if (before.priority !== newPriority) {
        await prisma.activity.create({
          data: {
            tenantId, pipelineItemId: itemId, userId, type: ActivityType.PRIORITY_CHANGE,
            content: `Prioridade alterada de "${PRIORITY_LABEL[before.priority] ?? before.priority}" para "${PRIORITY_LABEL[newPriority] ?? newPriority}"`,
          },
        });
      }
    }
  } catch (err) {
    console.error("[atualizarPrazoPrioridade]", err);
    return { error: "Erro ao atualizar prazo/prioridade." };
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
  return null;
}

export async function atualizarDescricao(
  pipelineId: string,
  itemId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para editar este item." };
  }

  const raw = (form.get("description") as string)?.trim() ?? "";
  const sanitized = raw ? sanitizeDocumentHtml(raw) : "";
  // Editor rich text vazio ainda manda marcação tipo "<p></p>" — trata como vazio de verdade.
  const description = sanitized.replace(/<[^>]+>/g, "").trim() ? sanitized : "";

  try {
    const before = await prisma.pipelineItem.findUnique({ where: { id: itemId }, select: { description: true } });

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { description: description ? description : null },
    });

    if (userId && before && (before.description ?? "") !== (description || "")) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.DESCRIPTION_CHANGE, content: "Descrição atualizada" },
      });
    }
  } catch (err) {
    console.error("[atualizarDescricao]", err);
    return { error: "Erro ao atualizar descrição." };
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
  return null;
}

export async function alternarTagItem(
  pipelineId: string,
  itemId: string,
  tagId: string,
  marcado: boolean
): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    if (marcado) {
      await prisma.pipelineItemTag.upsert({
        where: { pipelineItemId_tagId: { pipelineItemId: itemId, tagId } },
        create: { pipelineItemId: itemId, tagId },
        update: {},
      });
    } else {
      await prisma.pipelineItemTag.delete({
        where: { pipelineItemId_tagId: { pipelineItemId: itemId, tagId } },
      });
    }

    if (userId) {
      const tag = await prisma.tag.findUnique({ where: { id: tagId }, select: { name: true } });
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId: itemId, userId, type: ActivityType.TAG_CHANGE,
          content: `Tag "${tag?.name ?? "?"}" ${marcado ? "adicionada" : "removida"}`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarTagItem]", err);
    return;
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
}

export async function alternarResponsavelItem(
  pipelineId: string,
  itemId: string,
  userId: string,
  marcado: boolean
): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId: actorId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    if (marcado) {
      await prisma.pipelineItemAssignee.upsert({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
        create: { pipelineItemId: itemId, userId },
        update: {},
      });
    } else {
      await prisma.pipelineItemAssignee.delete({
        where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      });
    }

    if (actorId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId: itemId, userId: actorId, type: ActivityType.ASSIGNEE_CHANGE,
          content: `${user?.name ?? "?"} ${marcado ? "adicionado" : "removido"} como responsável`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarResponsavelItem]", err);
    return;
  }

  {
    const base = boardPath(pipeline);
    revalidatePath(base);
    revalidatePath(`${base}/itens/${itemId}`);
  }
}

// Prioridade específica de um responsável nessa tarefa (pode divergir da
// prioridade geral do item) — usado no seletor por avatar da visão em lista.
export async function atualizarPrioridadeResponsavel(pipelineId: string, itemId: string, userId: string, priority: number): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    await prisma.pipelineItemAssignee.update({
      where: { pipelineItemId_userId: { pipelineItemId: itemId, userId } },
      data: { priority },
    });
  } catch (err) {
    console.error("[atualizarPrioridadeResponsavel]", err);
    return;
  }

  revalidatePath(boardPath(pipeline));
}

// ─── Cronômetro ao vivo ─────────────────────────────────────────────────────
// Só 1 pessoa rastreando por vez num item — iniciar quando já há um cronômetro
// ativo (de outra pessoa) simplesmente não faz nada (UI já esconde esse caso).

export async function iniciarCronometro(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId }, select: { activeTimerUserId: true } });
    if (!item || item.activeTimerUserId) return; // já tem alguém rastreando

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { activeTimerUserId: userId, activeTimerStartedAt: new Date() },
    });
  } catch (err) {
    console.error("[iniciarCronometro]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function pararCronometro(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    const item = await prisma.pipelineItem.findFirst({
      where: { id: itemId, tenantId },
      select: { activeTimerUserId: true, activeTimerStartedAt: true },
    });
    if (!item || item.activeTimerUserId !== userId || !item.activeTimerStartedAt) return;

    const minutes = Math.max(1, Math.round((Date.now() - item.activeTimerStartedAt.getTime()) / 60_000));
    await prisma.$transaction([
      prisma.pipelineItem.update({ where: { id: itemId }, data: { activeTimerUserId: null, activeTimerStartedAt: null } }),
      prisma.timeEntry.create({ data: { tenantId, pipelineItemId: itemId, userId, minutes, loggedOn: new Date() } }),
    ]);
    await prisma.activity.create({
      data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.TIME_LOGGED, content: `${minutes} min apontados (cronômetro)` },
    });
  } catch (err) {
    console.error("[pararCronometro]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

// ─── Vincular itens / dependências ─────────────────────────────────────────

export async function criarLinkItem(pipelineId: string, itemId: string, linkedItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || itemId === linkedItemId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  const linked = await prisma.pipelineItem.findFirst({ where: { id: linkedItemId, tenantId } });
  if (!linked) return;

  try {
    await prisma.pipelineItemLink.upsert({
      where: { pipelineItemId_linkedItemId: { pipelineItemId: itemId, linkedItemId } },
      create: { tenantId, pipelineItemId: itemId, linkedItemId },
      update: {},
    });
  } catch (err) {
    console.error("[criarLinkItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function removerLinkItem(pipelineId: string, itemId: string, linkedItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    // O vínculo pode ter sido criado em qualquer direção (itemId como origem
    // ou como alvo) — remove o registro nos dois sentidos possíveis.
    await prisma.pipelineItemLink.deleteMany({
      where: {
        tenantId,
        OR: [
          { pipelineItemId: itemId, linkedItemId },
          { pipelineItemId: linkedItemId, linkedItemId: itemId },
        ],
      },
    });
  } catch (err) {
    console.error("[removerLinkItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function excluirItem(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  try {
    await prisma.pipelineItem.delete({ where: { id: itemId, tenantId } });
  } catch (err) {
    console.error("[excluirItem]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  redirect(base);
}

// ─── Subtarefas ────────────────────────────────────────────────────────────
// Reaproveita a própria PipelineItem (parentItemId) em vez de um modelo novo —
// uma subtarefa já ganha de graça status (stage), prioridade, prazo,
// responsável, tags, atividades e anexos, exatamente como um item de topo.
// Só 1 nível: uma subtarefa não pode ter subtarefas (checado abaixo).

export async function criarSubtarefa(parentItemId: string, title: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !title.trim()) return;

  const prisma = getPrisma();
  const parent = await prisma.pipelineItem.findFirst({ where: { id: parentItemId, tenantId } });
  if (!parent || parent.parentItemId) return; // não achou, ou é subtarefa (só 1 nível)

  const pipeline = await prisma.pipeline.findFirst({ where: { id: parent.pipelineId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: parent.pipelineId },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return;

    await prisma.pipelineItem.create({
      data: {
        tenantId,
        pipelineId: parent.pipelineId,
        stageId: firstStage.id,
        entityType: parent.entityType,
        entityId: parent.entityId,
        parentItemId: parent.id,
        title: title.trim(),
      },
    });

    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: parent.id, userId, type: ActivityType.SUBTASK_CHANGE, content: `Subtarefa "${title.trim()}" criada` },
      });
    }
  } catch (err) {
    console.error("[criarSubtarefa]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${parentItemId}`);
}

export async function excluirSubtarefa(parentItemId: string, subtaskId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const subtask = await prisma.pipelineItem.findFirst({ where: { id: subtaskId, tenantId, parentItemId } });
  if (!subtask) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: subtask.pipelineId } });
  if (!pipeline || !canManageSector(ctx, pipeline.sectorCode)) return;

  try {
    const title = subtask.title ?? "";
    await prisma.pipelineItem.delete({ where: { id: subtaskId } });
    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId: parentItemId, userId, type: ActivityType.SUBTASK_CHANGE, content: `Subtarefa "${title}" removida` },
      });
    }
  } catch (err) {
    console.error("[excluirSubtarefa]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${parentItemId}`);
}

// ─── Checklist ─────────────────────────────────────────────────────────────
// Lista simples por item (sem "Checklist" nomeado separado) — cobre etapas
// pequenas que não justificam virar subtarefa própria.

async function loadItemPipeline(tenantId: string, pipelineItemId: string) {
  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: pipelineItemId, tenantId } });
  if (!item) return null;
  const pipeline = await prisma.pipeline.findFirst({ where: { id: item.pipelineId } });
  if (!pipeline) return null;
  return { prisma, item, pipeline };
}

export async function criarChecklistItem(pipelineItemId: string, textRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  const text = textRaw.trim();
  if (!tenantId || !text) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) return;
  const { prisma, pipeline } = loaded;

  try {
    const last = await prisma.checklistItem.findFirst({
      where: { pipelineItemId },
      orderBy: { order: "desc" },
      select: { order: true },
    });
    await prisma.checklistItem.create({
      data: { tenantId, pipelineItemId, text, order: (last?.order ?? -1) + 1 },
    });
    if (userId) {
      await prisma.activity.create({
        data: { tenantId, pipelineItemId, userId, type: ActivityType.CHECKLIST_CHANGE, content: `Item de checklist "${text}" adicionado` },
      });
    }
  } catch (err) {
    console.error("[criarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function alternarChecklistItem(pipelineItemId: string, checklistItemId: string, done: boolean): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) return;
  const { prisma, pipeline } = loaded;

  try {
    const item = await prisma.checklistItem.update({
      where: { id: checklistItemId, pipelineItemId },
      data: { done },
    });
    if (userId) {
      await prisma.activity.create({
        data: {
          tenantId, pipelineItemId, userId, type: ActivityType.CHECKLIST_CHANGE,
          content: `Item de checklist "${item.text}" ${done ? "concluído" : "reaberto"}`,
        },
      });
    }
  } catch (err) {
    console.error("[alternarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function editarChecklistItem(pipelineItemId: string, checklistItemId: string, text: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId || !text.trim()) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) return;
  const { prisma, pipeline } = loaded;

  try {
    await prisma.checklistItem.update({ where: { id: checklistItemId, pipelineItemId }, data: { text: text.trim() } });
  } catch (err) {
    console.error("[editarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

export async function excluirChecklistItem(pipelineItemId: string, checklistItemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) return;
  const { prisma, pipeline } = loaded;

  try {
    await prisma.checklistItem.delete({ where: { id: checklistItemId, pipelineItemId } });
  } catch (err) {
    console.error("[excluirChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}
export async function reordenarChecklistItem(pipelineItemId: string, checklistItemId: string, direction: "up" | "down"): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) return;
  const { prisma, pipeline } = loaded;

  try {
    const items = await prisma.checklistItem.findMany({ where: { pipelineItemId }, orderBy: { order: "asc" } });
    const index = items.findIndex((i) => i.id === checklistItemId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || swapIndex < 0 || swapIndex >= items.length) return;

    const a = items[index];
    const b = items[swapIndex];
    await prisma.$transaction([
      prisma.checklistItem.update({ where: { id: a.id }, data: { order: b.order } }),
      prisma.checklistItem.update({ where: { id: b.id }, data: { order: a.order } }),
    ]);
  } catch (err) {
    console.error("[reordenarChecklistItem]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
}

// ─── Conclusão / reabertura explícita ──────────────────────────────────────
// "Concluída" continua sendo derivado do estágio terminal (não vira campo
// novo) — mas em vez de exigir que o usuário arraste até a última coluna,
// esses dois botões fazem o mesmo movimento com 1 clique e registram um
// evento de histórico específico (COMPLETED/REOPENED), distinto do
// STATUS_CHANGE genérico usado pra mover entre colunas do meio.

export async function concluirTarefa(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    const terminalStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId, isTerminal: true },
      orderBy: { order: "desc" },
    });
    if (!terminalStage || item.stageId === terminalStage.id) return;

    await prisma.pipelineItem.update({ where: { id: itemId }, data: { stageId: terminalStage.id } });
    await prisma.activity.create({
      data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.COMPLETED, content: "Tarefa concluída" },
    });
  } catch (err) {
    console.error("[concluirTarefa]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  revalidatePath(`${base}/itens/${itemId}`);
}

export async function reabrirTarefa(pipelineId: string, itemId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return;

  const prisma = getPrisma();
  const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
  if (!item) return;

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId, isTerminal: false },
      orderBy: { order: "asc" },
    });
    const targetStage = firstStage ?? (await prisma.pipelineStage.findFirst({ where: { pipelineId }, orderBy: { order: "asc" } }));
    if (!targetStage || item.stageId === targetStage.id) return;

    await prisma.pipelineItem.update({ where: { id: itemId }, data: { stageId: targetStage.id } });
    await prisma.activity.create({
      data: { tenantId, pipelineItemId: itemId, userId, type: ActivityType.REOPENED, content: "Tarefa reaberta" },
    });
  } catch (err) {
    console.error("[reabrirTarefa]", err);
    return;
  }

  const base = boardPath(pipeline);
  revalidatePath(base);
  revalidatePath(`${base}/itens/${itemId}`);
}

// ─── Estimativa e controle de tempo ────────────────────────────────────────
// Lançamento manual (sem cronômetro ao vivo) — cobre estimativa, apontamento
// por usuário, total acumulado e comparação estimado x realizado. Nada aqui
// é obrigatório: ambos os campos ficam vazios por padrão.

export async function atualizarEstimativa(pipelineId: string, itemId: string, minutesRaw: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) return;

  const trimmed = minutesRaw.trim();
  const minutes = trimmed ? parseInt(trimmed, 10) : null;
  if (trimmed && (!Number.isInteger(minutes) || minutes! < 0)) return;

  try {
    await prisma.pipelineItem.update({ where: { id: itemId }, data: { estimateMinutes: minutes } });
  } catch (err) {
    console.error("[atualizarEstimativa]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

export async function criarLancamentoTempo(pipelineItemId: string, _prev: PipelineState, form: FormData): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const minutesRaw = (form.get("minutes") as string)?.trim();
  const minutes = parseInt(minutesRaw, 10);
  if (!Number.isInteger(minutes) || minutes <= 0) return { error: "Informe os minutos gastos (maior que zero)" };

  const noteRaw = (form.get("note") as string)?.trim();
  const loggedOnRaw = (form.get("loggedOn") as string)?.trim();
  const loggedOn = loggedOnRaw ? new Date(loggedOnRaw) : new Date();
  if (Number.isNaN(loggedOn.getTime())) return { error: "Data inválida" };

  const loaded = await loadItemPipeline(tenantId, pipelineItemId);
  if (!loaded || !canActOnSector(ctx, loaded.pipeline.sectorCode)) {
    return { error: "Sem permissão para editar este item." };
  }
  const { prisma, pipeline } = loaded;

  try {
    await prisma.timeEntry.create({
      data: { tenantId, pipelineItemId, userId, minutes, note: noteRaw || null, loggedOn },
    });
    await prisma.activity.create({
      data: {
        tenantId, pipelineItemId, userId, type: ActivityType.TIME_LOGGED,
        content: `${minutes} min apontados${noteRaw ? ` — ${noteRaw}` : ""}`,
      },
    });
  } catch (err) {
    console.error("[criarLancamentoTempo]", err);
    return { error: "Erro ao registrar apontamento." };
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${pipelineItemId}`);
  return null;
}

export async function excluirLancamentoTempo(pipelineId: string, itemId: string, entryId: string): Promise<void> {
  const ctx = await getAuthContext();
  const { tenantId, userId } = ctx;
  if (!tenantId) return;

  const prisma = getPrisma();
  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline) return;

  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, pipelineItemId: itemId, tenantId }, select: { userId: true } });
  // Autor apaga o próprio apontamento; coordenador (canManage) apaga qualquer um.
  if (!entry || (entry.userId !== userId && !canManageSector(ctx, pipeline.sectorCode))) return;

  try {
    await prisma.timeEntry.delete({ where: { id: entryId } });
  } catch (err) {
    console.error("[excluirLancamentoTempo]", err);
    return;
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
}

// ─── Duplicar Pipeline ──────────────────────────────────────────────────────
// Clona um Pipeline inteiro (estágios, tarefas de topo, subtarefas, checklist
// e tags) pra uma empresa/pessoa de destino diferente — cobre o caso de
// "template padrão" que se repete por cliente (ex.: processo de implantação
// do BPO): monta o template 1x, depois duplica e aponta pro cliente novo em
// vez de recriar tudo manualmente. Prazos e responsáveis NÃO são copiados
// (ficam em branco na cópia) — são específicos de cada execução real.

export async function duplicarPipeline(
  sourcePipelineId: string,
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const ctx = await getAuthContext();
  const { tenantId } = ctx;
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  const entityId = (form.get("entityId") as string)?.trim();
  if (!name) return { error: "Nome do novo kanban é obrigatório" };
  if (!entityId) return { error: "Selecione a empresa ou pessoa de destino" };

  const prisma = getPrisma();
  const source = await prisma.pipeline.findFirst({
    where: { id: sourcePipelineId, ...scopedPipelineWhere(ctx) },
    include: {
      stages: { orderBy: { order: "asc" } },
      items: {
        where: { parentItemId: null },
        include: {
          tags: { select: { tagId: true } },
          checklist: { orderBy: { order: "asc" } },
          subtasks: {
            include: {
              tags: { select: { tagId: true } },
              checklist: { orderBy: { order: "asc" } },
            },
          },
        },
      },
    },
  });
  if (!source) return { error: "Kanban de origem não encontrado." };
  if (!canManageSector(ctx, source.sectorCode)) {
    return { error: "Sem permissão para duplicar kanban neste setor." };
  }

  const entity =
    source.entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, tenantId } })
      : await prisma.person.findFirst({ where: { id: entityId, tenantId } });
  if (!entity) return { error: "Empresa ou pessoa de destino não encontrada." };

  let newPipelineId: string;
  try {
    const created = await prisma.pipeline.create({
      data: {
        tenantId,
        name,
        sectorCode: source.sectorCode,
        spaceId: source.spaceId,
        folderId: source.folderId,
        color: source.color,
        entityType: source.entityType,
        stages: {
          create: source.stages.map((s) => ({ name: s.name, color: s.color, order: s.order, isTerminal: s.isTerminal, type: s.type })),
        },
      },
      include: { stages: true },
    });
    newPipelineId = created.id;

    const stageMap = new Map<string, string>();
    for (const oldStage of source.stages) {
      const newStage = created.stages.find((s) => s.order === oldStage.order);
      if (newStage) stageMap.set(oldStage.id, newStage.id);
    }

    for (const item of source.items) {
      const newStageId = stageMap.get(item.stageId);
      if (!newStageId) continue;

      const newItem = await prisma.pipelineItem.create({
        data: {
          tenantId,
          pipelineId: newPipelineId,
          stageId: newStageId,
          entityType: source.entityType,
          entityId,
          title: item.title,
          description: item.description,
          priority: item.priority,
          tags: item.tags.length > 0 ? { create: item.tags.map((t) => ({ tagId: t.tagId })) } : undefined,
          checklist:
            item.checklist.length > 0
              ? { create: item.checklist.map((c) => ({ tenantId, text: c.text, order: c.order })) }
              : undefined,
        },
      });

      for (const sub of item.subtasks) {
        const subStageId = stageMap.get(sub.stageId) ?? newStageId;
        await prisma.pipelineItem.create({
          data: {
            tenantId,
            pipelineId: newPipelineId,
            stageId: subStageId,
            entityType: source.entityType,
            entityId,
            parentItemId: newItem.id,
            title: sub.title,
            description: sub.description,
            priority: sub.priority,
            tags: sub.tags.length > 0 ? { create: sub.tags.map((t) => ({ tagId: t.tagId })) } : undefined,
            checklist:
              sub.checklist.length > 0
                ? { create: sub.checklist.map((c) => ({ tenantId, text: c.text, order: c.order })) }
                : undefined,
          },
        });
      }
    }
  } catch (err) {
    console.error("[duplicarPipeline]", err);
    return { error: "Erro ao duplicar kanban. Tente novamente." };
  }

  redirect(boardPath({ id: newPipelineId, sectorCode: source.sectorCode }));
}

// Documentos (canvas) por tarefa — removido em 2026-07-24, virou módulo
// próprio "Manual" (ver src/app/(app)/bpo-manual/actions.ts).
