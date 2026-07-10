"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { TrainingParticipantStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { isPrismaUniqueError } from "@/lib/prismaErrors";

export type TrainingParticipantState = { error: string } | null;

export async function adicionarParticipante(
  trainingId: string,
  classId: string,
  _prev: TrainingParticipantState,
  form: FormData
): Promise<TrainingParticipantState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para adicionar participantes." };

  const prisma = getPrisma();
  const trainingClass = await prisma.trainingClass.findFirst({ where: { id: classId, tenantId: ctx.tenantId, trainingId } });
  if (!trainingClass) return { error: "Turma não encontrada." };

  const personId = form.get("personId") as string;
  if (!personId) return { error: "Selecione um colaborador." };

  try {
    await prisma.trainingParticipant.create({
      data: { tenantId: ctx.tenantId, classId, personId },
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { error: "Este colaborador já está nesta turma." };
    console.error("[adicionarParticipante]", err);
    return { error: "Erro ao adicionar participante." };
  }

  revalidatePath(`/treinamentos/${trainingId}/turmas/${classId}`);
  return null;
}

export async function atualizarParticipante(
  trainingId: string,
  classId: string,
  participantId: string,
  _prev: TrainingParticipantState,
  form: FormData
): Promise<TrainingParticipantState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para atualizar participantes." };

  const status = form.get("status") as TrainingParticipantStatus;
  if (!Object.values(TrainingParticipantStatus).includes(status)) return { error: "Status inválido." };

  const prisma = getPrisma();
  const existing = await prisma.trainingParticipant.findFirst({ where: { id: participantId, tenantId: ctx.tenantId, classId } });
  if (!existing) return { error: "Participante não encontrado." };

  try {
    await prisma.trainingParticipant.update({ where: { id: participantId }, data: { status } });
  } catch (err) {
    console.error("[atualizarParticipante]", err);
    return { error: "Erro ao atualizar participante." };
  }

  revalidatePath(`/treinamentos/${trainingId}/turmas/${classId}`);
  return null;
}

export async function removerParticipante(trainingId: string, classId: string, participantId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.trainingParticipant.findFirst({ where: { id: participantId, tenantId: ctx.tenantId, classId } });
  if (!existing) return;

  try {
    await prisma.trainingParticipant.delete({ where: { id: participantId } });
  } catch (err) {
    console.error("[removerParticipante]", err);
    return;
  }

  revalidatePath(`/treinamentos/${trainingId}/turmas/${classId}`);
}
