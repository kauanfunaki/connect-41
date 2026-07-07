"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export type TrainingClassState = { error: string } | null;

export async function criarTurma(
  trainingId: string,
  _prev: TrainingClassState,
  form: FormData
): Promise<TrainingClassState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar turmas." };

  const prisma = getPrisma();
  const training = await prisma.training.findFirst({ where: { id: trainingId, tenantId: ctx.tenantId } });
  if (!training) return { error: "Treinamento não encontrado." };

  const dateRaw = (form.get("date") as string)?.trim();
  if (!dateRaw) return { error: "Informe a data da turma." };

  let classId: string;
  try {
    const trainingClass = await prisma.trainingClass.create({
      data: {
        tenantId: ctx.tenantId,
        trainingId,
        date: new Date(dateRaw),
        shift: (form.get("shift") as string)?.trim() || null,
        instructor: (form.get("instructor") as string)?.trim() || null,
      },
    });
    classId = trainingClass.id;
  } catch (err) {
    console.error("[criarTurma]", err);
    return { error: "Erro ao criar turma." };
  }

  revalidatePath(`/treinamentos/${trainingId}`);
  redirect(`/treinamentos/${trainingId}/turmas/${classId}`);
}

export async function excluirTurma(trainingId: string, classId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.trainingClass.findFirst({ where: { id: classId, tenantId: ctx.tenantId, trainingId } });
  if (!existing) return;

  try {
    await prisma.trainingClass.delete({ where: { id: classId } });
  } catch (err) {
    console.error("[excluirTurma]", err);
    return;
  }

  revalidatePath(`/treinamentos/${trainingId}`);
}
