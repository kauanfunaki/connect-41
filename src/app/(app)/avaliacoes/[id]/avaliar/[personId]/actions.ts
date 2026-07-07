"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";

export type EvaluationState = { error: string } | null;

export async function registrarAvaliacao(
  cycleId: string,
  personId: string,
  _prev: EvaluationState,
  form: FormData
): Promise<EvaluationState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };
  if (!canWrite(ctx.role)) return { error: "Sem permissão para avaliar colaboradores." };

  const prisma = getPrisma();
  const cycle = await prisma.evaluationCycle.findFirst({ where: { id: cycleId, tenantId: ctx.tenantId } });
  if (!cycle) return { error: "Ciclo não encontrado." };

  const person = await prisma.person.findFirst({ where: { id: personId, tenantId: ctx.tenantId } });
  if (!person) return { error: "Colaborador não encontrado." };

  const competencies = await prisma.competency.findMany({ where: { tenantId: ctx.tenantId, active: true } });
  const scoreEntries = competencies
    .map((c) => ({ competencyId: c.id, score: (form.get(`score_${c.id}`) as string)?.trim() }))
    .filter((s): s is { competencyId: string; score: string } => !!s.score);

  if (scoreEntries.length === 0) return { error: "Informe ao menos uma nota." };

  const average = scoreEntries.reduce((sum, s) => sum + Number(s.score), 0) / scoreEntries.length;
  const notes = (form.get("notes") as string)?.trim() || null;
  const developmentPlan = (form.get("developmentPlan") as string)?.trim() || null;
  const improvementDeadlineRaw = (form.get("improvementDeadline") as string)?.trim();

  try {
    const evaluation = await prisma.evaluation.upsert({
      where: { cycleId_personId: { cycleId, personId } },
      create: {
        tenantId: ctx.tenantId,
        cycleId,
        personId,
        evaluatorUserId: ctx.userId,
        averageScore: average.toFixed(2),
        notes,
        developmentPlan,
        improvementDeadline: improvementDeadlineRaw ? new Date(improvementDeadlineRaw) : null,
      },
      update: {
        evaluatorUserId: ctx.userId,
        evaluationDate: new Date(),
        averageScore: average.toFixed(2),
        notes,
        developmentPlan,
        improvementDeadline: improvementDeadlineRaw ? new Date(improvementDeadlineRaw) : null,
      },
    });

    await prisma.evaluationScore.deleteMany({ where: { evaluationId: evaluation.id } });
    await prisma.evaluationScore.createMany({
      data: scoreEntries.map((s) => ({
        tenantId: ctx.tenantId,
        evaluationId: evaluation.id,
        competencyId: s.competencyId,
        score: s.score,
      })),
    });
  } catch (err) {
    console.error("[registrarAvaliacao]", err);
    return { error: "Erro ao registrar avaliação." };
  }

  revalidatePath(`/avaliacoes/${cycleId}`);
  revalidatePath(`/pessoas/${personId}`);
  redirect(`/avaliacoes/${cycleId}`);
}
