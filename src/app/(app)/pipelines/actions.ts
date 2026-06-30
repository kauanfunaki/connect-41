"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { PipelineEntityType, ActivityType } from "@/generated/prisma/enums";

export type PipelineState = { error: string } | null;

async function getCtx() {
  const h = await headers();
  return {
    tenantId: h.get("x-tenant-id"),
    userId: h.get("x-user-id"),
  };
}

export async function criarPipeline(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const { tenantId } = await getCtx();
  if (!tenantId) return { error: "Não autenticado" };

  const name = (form.get("name") as string)?.trim();
  const sectorCode = (form.get("sectorCode") as string)?.trim();
  const entityType = form.get("entityType") as PipelineEntityType;

  if (!name) return { error: "Nome do pipeline é obrigatório" };
  if (!sectorCode) return { error: "Setor é obrigatório" };

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
    return { error: "Erro ao criar pipeline. Tente novamente." };
  }

  redirect(`/pipelines/${id}`);
}

export async function criarItem(
  _prev: PipelineState,
  form: FormData
): Promise<PipelineState> {
  const { tenantId } = await getCtx();
  if (!tenantId) return { error: "Não autenticado" };

  const pipelineId = form.get("pipelineId") as string;
  const entityType = form.get("entityType") as PipelineEntityType;
  const entityId = form.get("entityId") as string;
  const dueDateRaw = (form.get("dueDate") as string)?.trim();
  const priorityRaw = (form.get("priority") as string)?.trim();

  if (!entityId) return { error: "Selecione uma empresa ou pessoa" };

  const prisma = getPrisma();

  try {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { order: "asc" },
    });
    if (!firstStage) return { error: "Pipeline sem estágios configurados" };

    await prisma.pipelineItem.create({
      data: {
        tenantId,
        pipelineId,
        stageId: firstStage.id,
        entityType,
        entityId,
        dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
        priority: priorityRaw ? parseInt(priorityRaw) : 0,
      },
    });
  } catch (err) {
    console.error("[criarItem]", err);
    return { error: "Erro ao adicionar item. Tente novamente." };
  }

  revalidatePath(`/pipelines/${pipelineId}`);
  redirect(`/pipelines/${pipelineId}`);
}

export async function moverItem(
  itemId: string,
  newStageId: string
): Promise<void> {
  const { tenantId, userId } = await getCtx();
  if (!tenantId || !userId) return;

  const prisma = getPrisma();

  try {
    const item = await prisma.pipelineItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) return;

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

    revalidatePath(`/pipelines/${item.pipelineId}`);
    revalidatePath(`/pipelines/${item.pipelineId}/itens/${itemId}`);
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
  const { tenantId, userId } = await getCtx();
  if (!tenantId || !userId) return { error: "Não autenticado" };

  const content = (form.get("content") as string)?.trim();
  if (!content) return { error: "Escreva uma nota" };

  const prisma = getPrisma();

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

  revalidatePath(`/pipelines/${pipelineId}/itens/${itemId}`);
  return null;
}

export async function excluirItem(pipelineId: string, itemId: string): Promise<void> {
  const { tenantId } = await getCtx();
  if (!tenantId) return;

  const prisma = getPrisma();
  try {
    await prisma.pipelineItem.delete({ where: { id: itemId, tenantId } });
  } catch (err) {
    console.error("[excluirItem]", err);
    return;
  }

  revalidatePath(`/pipelines/${pipelineId}`);
  redirect(`/pipelines/${pipelineId}`);
}
