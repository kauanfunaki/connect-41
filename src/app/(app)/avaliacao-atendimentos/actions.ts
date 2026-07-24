"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { summarizeAgentEvaluations } from "@/lib/ai";

const MAX_EVALUATIONS_FOR_SUMMARY = 30;

// Vínculo manual agente do Chatwoot <-> User — mesmo critério de permissão
// usado pra vincular contato em /conversas (isFullAccess).
export async function vincularAgenteChatwoot(agentLinkId: string, userId: string | null): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return;

  const prisma = getPrisma();
  const agentLink = await prisma.chatwootAgentLink.findFirst({ where: { id: agentLinkId, tenantId: ctx.tenantId }, select: { id: true } });
  if (!agentLink) return;

  if (userId) {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!user) return;
  }

  await prisma.chatwootAgentLink.update({ where: { id: agentLinkId }, data: { linkedUserId: userId } });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.agent.linked",
    entityType: "ChatwootAgentLink",
    entityId: agentLinkId,
    metadata: { userId },
  });

  revalidatePath("/avaliacao-atendimentos");
}

// Resumo consolidado de um atendente — sob demanda (nunca automático, custo
// de IA só quando o usuário pede). groupKey replica a mesma chave de
// agrupamento da página (id:<assigneeId> ou label:<assigneeLabel>) — refeito
// aqui a partir do banco, nunca confiando em avaliações que o cliente diga
// que pertencem ao grupo.
export async function gerarResumoAgente(groupKey: string, agentLabel: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullAccess(ctx.role)) return { error: "Sem permissão para gerar resumo." };

  const prisma = getPrisma();
  const evaluations = await prisma.conversationEvaluation.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { evaluatedAt: "desc" },
    take: 500,
    select: {
      score: true,
      writingScore: true,
      slaScore: true,
      reasoning: true,
      conversation: { select: { id: true, assigneeId: true, assigneeLabel: true } },
    },
  });

  const matching = evaluations
    .filter((ev) => {
      const key =
        ev.conversation.assigneeId != null
          ? `id:${ev.conversation.assigneeId}`
          : ev.conversation.assigneeLabel
            ? `label:${ev.conversation.assigneeLabel}`
            : "sem-atendente";
      return key === groupKey;
    })
    .slice(0, MAX_EVALUATIONS_FOR_SUMMARY);

  if (matching.length === 0) return { error: "Nenhuma avaliação encontrada para este atendente." };

  try {
    const result = await summarizeAgentEvaluations(
      ctx.tenantId,
      agentLabel,
      matching.map((m) => ({ conversationId: m.conversation.id, score: m.score, writingScore: m.writingScore, slaScore: m.slaScore, reasoning: m.reasoning }))
    );

    await prisma.agentEvaluationSummary.upsert({
      where: { tenantId_groupKey: { tenantId: ctx.tenantId, groupKey } },
      create: {
        tenantId: ctx.tenantId,
        groupKey,
        summary: result.summary,
        exampleConversationIds: result.examples,
        evaluationCount: matching.length,
      },
      update: {
        summary: result.summary,
        exampleConversationIds: result.examples,
        evaluationCount: matching.length,
        generatedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("[gerarResumoAgente]", err);
    return { error: err instanceof Error ? err.message : "Erro ao gerar resumo." };
  }

  revalidatePath("/avaliacao-atendimentos");
  return { ok: true };
}
