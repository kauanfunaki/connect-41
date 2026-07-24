"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullAccess } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { ensureMessagesLoaded, loadOlderMessages } from "@/lib/chatwoot/conversations";
import { summarizeAgentEvaluations } from "@/lib/ai";
import { formatInstantDate } from "@/lib/format";

const MAX_EVALUATIONS_FOR_SUMMARY = 30;

export type MensagemAtendimento = {
  id: string;
  senderLabel: string | null;
  messageType: string;
  content: string | null;
  isPrivate: boolean;
  attachments: { fileType: string; fileSize: number | null; url: string }[];
  createdAtLabel: string;
};

// Carrega (sob demanda, na primeira expansão do atendimento) e retorna as
// mensagens já serializadas. Notas internas são filtradas AQUI, no servidor —
// nunca chegam ao browser de quem não tem permissão.
export async function carregarMensagens(conversationId: string): Promise<MensagemAtendimento[]> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return [];

  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!conversation) return [];

  await ensureMessagesLoaded(ctx.tenantId, conversationId);

  const canViewPrivate = isFullAccess(ctx.role);
  const messages = await prisma.chatwootMessage.findMany({
    where: { conversationId, ...(canViewPrivate ? {} : { isPrivate: false }) },
    orderBy: { chatwootCreatedAt: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    senderLabel: m.senderLabel,
    messageType: m.messageType,
    content: m.content,
    isPrivate: m.isPrivate,
    attachments: (m.attachments as { fileType: string; fileSize: number | null; url: string }[] | null) ?? [],
    createdAtLabel: formatInstantDate(m.chatwootCreatedAt),
  }));
}

// Busca uma página mais antiga na API do Chatwoot e devolve a lista completa
// atualizada (mesma serialização/filtro de carregarMensagens).
export async function carregarMensagensAntigas(conversationId: string): Promise<{ loaded: number; messages: MensagemAtendimento[] }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { loaded: 0, messages: [] };
  const { loaded } = await loadOlderMessages(ctx.tenantId, conversationId);
  return { loaded, messages: await carregarMensagens(conversationId) };
}

// Vínculo manual — nunca sobrescrito por sincronização automática (ver
// upsertContactLink em src/lib/chatwoot/sync.ts). Só quem administra o tenant
// resolve ambiguidades (contato ASSISTED/UNLINKED), mesmo critério de
// isFullAccess usado para dado sensível em outros módulos.
export async function vincularContatoChatwoot(
  contactLinkId: string,
  target: { personId?: string; companyId?: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullAccess(ctx.role)) return { ok: false, error: "Sem permissão para vincular contatos." };

  const prisma = getPrisma();
  const link = await prisma.chatwootContactLink.findFirst({ where: { id: contactLinkId, tenantId: ctx.tenantId } });
  if (!link) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.chatwootContactLink.update({
    where: { id: contactLinkId },
    data: { personId: target.personId ?? null, companyId: target.companyId ?? null, linkMethod: "MANUAL", linkConfidence: null },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.contact.linked",
    entityType: "ChatwootContactLink",
    entityId: contactLinkId,
    metadata: { personId: target.personId, companyId: target.companyId },
  });

  revalidatePath("/conversas");
  return { ok: true };
}

export async function desvincularContatoChatwoot(contactLinkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, error: "Não autenticado" };
  if (!isFullAccess(ctx.role)) return { ok: false, error: "Sem permissão para desvincular contatos." };

  const prisma = getPrisma();
  const link = await prisma.chatwootContactLink.findFirst({ where: { id: contactLinkId, tenantId: ctx.tenantId } });
  if (!link) return { ok: false, error: "Vínculo não encontrado." };

  await prisma.chatwootContactLink.update({
    where: { id: contactLinkId },
    data: { personId: null, companyId: null, linkMethod: "UNLINKED", linkConfidence: null },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "chatwoot.contact.unlinked",
    entityType: "ChatwootContactLink",
    entityId: contactLinkId,
  });

  revalidatePath("/conversas");
  return { ok: true };
}

// Resumo consolidado de um atendente — sob demanda (nunca automático, custo
// de IA só quando o usuário pede). groupKey replica a mesma chave de
// agrupamento da view de Avaliação (id:<assigneeId> ou label:<assigneeLabel>)
// — refeito aqui a partir do banco, nunca confiando em avaliações que o
// cliente diga que pertencem ao grupo.
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

  revalidatePath("/conversas");
  return { ok: true };
}
