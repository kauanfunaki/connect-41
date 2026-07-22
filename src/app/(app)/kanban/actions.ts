"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PipelineEntityType, ActivityType } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

export type PipelineState = { error: string } | null;

// Setores com módulo dedicado (rota própria, fora do /kanban genérico) usam
// essa base de path nos redirects/revalidate em vez de /kanban/{id} — mantém
// as server actions únicas mesmo com múltiplas telas de board no app.
const DEDICATED_SECTOR_ROUTES: Record<string, string> = {
  bpo: "/bpo-financeiro",
};

function boardPath(pipeline: { id: string; sectorCode: string }): string {
  const base = DEDICATED_SECTOR_ROUTES[pipeline.sectorCode];
  return base ? `${base}/${pipeline.id}` : `/kanban/${pipeline.id}`;
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
    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        name,
        sectorCode,
        entityType,
        stages: {
          create: stages.map((s, i) => ({
            name: s.name,
            color: s.color,
            order: i,
            isTerminal: i === stages.length - 1,
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
  const entityType = form.get("entityType") as PipelineEntityType;
  const entityId = form.get("entityId") as string;
  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();
  const descriptionRaw = (form.get("description") as string)?.trim();

  if (!entityId) return { error: "Selecione uma empresa ou pessoa" };

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
        entityType,
        entityId,
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

  const prisma = getPrisma();

  const pipeline = await prisma.pipeline.findFirst({ where: { id: pipelineId, tenantId } });
  if (!pipeline || !canActOnSector(ctx, pipeline.sectorCode)) {
    return { error: "Sem permissão para registrar atividade neste setor." };
  }

  try {
    await prisma.activity.create({
      data: {
        tenantId,
        pipelineItemId: itemId,
        userId,
        type: ActivityType.NOTE,
        content,
      },
    });
  } catch (err) {
    console.error("[adicionarNota]", err);
    return { error: "Erro ao adicionar nota." };
  }

  revalidatePath(`${boardPath(pipeline)}/itens/${itemId}`);
  return null;
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
  const priorityRaw = (form.get("priority") as string)?.trim();
  const newDueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  const newPriority = priorityRaw ? parseInt(priorityRaw) : 0;

  try {
    const before = await prisma.pipelineItem.findUnique({
      where: { id: itemId },
      select: { dueDate: true, priority: true },
    });

    await prisma.pipelineItem.update({
      where: { id: itemId },
      data: { dueDate: newDueDate, priority: newPriority },
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

  const description = (form.get("description") as string)?.trim();

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
