"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { InterviewRecommendation } from "@/generated/prisma/enums";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";

export type ScorecardState = { error: string } | null;

// Nota 1-5 de um critério; qualquer coisa fora disso vira null (não pontuado).
function pickScore(form: FormData, key: string): number | null {
  const raw = (form.get(key) as string)?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return n >= 1 && n <= 5 ? n : null;
}

async function findCandidaturaInScope(vagaId: string, candidaturaId: string, ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  const prisma = getPrisma();
  return prisma.candidatura.findFirst({
    where: { id: candidaturaId, vagaId, tenantId: ctx.tenantId, vaga: { ...scopedVagaWhere(ctx) } },
    include: { vaga: { select: { sectorCode: true } } },
  });
}

export async function salvarScorecard(
  vagaId: string,
  candidaturaId: string,
  _prev: ScorecardState,
  form: FormData
): Promise<ScorecardState> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return { error: "Não autenticado" };

  const candidatura = await findCandidaturaInScope(vagaId, candidaturaId, ctx);
  if (!candidatura) return { error: "Candidatura não encontrada ou fora do seu escopo." };
  if (!canActOnSector(ctx, candidatura.vaga.sectorCode)) {
    return { error: "Sem permissão para avaliar candidatos nesta vaga." };
  }

  const recommendation = form.get("recommendation") as InterviewRecommendation;
  if (!Object.values(InterviewRecommendation).includes(recommendation)) {
    return { error: "Recomendação inválida." };
  }

  const data = {
    stage: candidatura.stage, // contexto: etapa atual da candidatura
    comunicacao: pickScore(form, "comunicacao"),
    tecnico: pickScore(form, "tecnico"),
    fitCultural: pickScore(form, "fitCultural"),
    experiencia: pickScore(form, "experiencia"),
    recommendation,
    notes: (form.get("notes") as string)?.trim() || null,
  };

  const prisma = getPrisma();
  try {
    // Um scorecard por entrevistador por candidatura — reenviar edita o próprio.
    await prisma.interviewScorecard.upsert({
      where: { candidaturaId_evaluatorUserId: { candidaturaId, evaluatorUserId: ctx.userId } },
      create: { tenantId: ctx.tenantId, candidaturaId, evaluatorUserId: ctx.userId, ...data },
      update: data,
    });
  } catch (err) {
    console.error("[salvarScorecard]", err);
    return { error: "Erro ao salvar o parecer." };
  }

  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
  return null;
}

export async function excluirScorecard(vagaId: string, candidaturaId: string, scorecardId: string): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return;

  const prisma = getPrisma();
  // Só o próprio avaliador remove o seu parecer.
  const scorecard = await prisma.interviewScorecard.findFirst({
    where: { id: scorecardId, candidaturaId, tenantId: ctx.tenantId, evaluatorUserId: ctx.userId },
  });
  if (!scorecard) return;

  try {
    await prisma.interviewScorecard.delete({ where: { id: scorecardId } });
  } catch (err) {
    console.error("[excluirScorecard]", err);
    return;
  }

  revalidatePath(`/vagas/${vagaId}/candidaturas/${candidaturaId}`);
}
