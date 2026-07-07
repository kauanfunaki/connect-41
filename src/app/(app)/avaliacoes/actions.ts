"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export type EvaluationCycleState = { error: string } | null;

export async function criarCiclo(_prev: EvaluationCycleState, form: FormData): Promise<EvaluationCycleState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para criar ciclos de avaliação." };

  const name = (form.get("name") as string)?.trim();
  const startDateRaw = (form.get("startDate") as string)?.trim();
  const endDateRaw = (form.get("endDate") as string)?.trim();
  if (!name) return { error: "Nome do ciclo é obrigatório" };
  if (!startDateRaw) return { error: "Informe a data de início." };

  const prisma = getPrisma();
  let id: string;
  try {
    const cycle = await prisma.evaluationCycle.create({
      data: {
        tenantId: ctx.tenantId,
        name,
        startDate: new Date(startDateRaw),
        endDate: endDateRaw ? new Date(endDateRaw) : null,
      },
    });
    id = cycle.id;
  } catch (err) {
    console.error("[criarCiclo]", err);
    return { error: "Erro ao criar ciclo de avaliação." };
  }

  redirect(`/avaliacoes/${id}`);
}

export async function encerrarCiclo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.evaluationCycle.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  await prisma.evaluationCycle.update({ where: { id }, data: { active: false } });
  revalidatePath(`/avaliacoes/${id}`);
}

export async function excluirCiclo(id: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) return;

  const prisma = getPrisma();
  const existing = await prisma.evaluationCycle.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!existing) return;

  try {
    await prisma.evaluationCycle.delete({ where: { id } });
  } catch (err) {
    console.error("[excluirCiclo]", err);
    return;
  }

  revalidatePath("/avaliacoes");
  redirect("/avaliacoes");
}
