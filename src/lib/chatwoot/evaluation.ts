// Avaliação de Atendimentos — nota de 0-100 (Escrita 0-50 + SLA 0-50) gerada
// quando uma ChatwootConversation é resolvida (resolvedAt setado em
// sync.ts). CSAT foi cogitado e descartado nesta v1 (ver
// Backlog-Avaliacao-Atendimentos-2026-07-24.md no vault Obsidian). Sem
// fila/worker — mesmo espírito de src/lib/chatwoot/sync.ts, chamado por um
// cron externo (ver src/app/api/cron/evaluate-conversations/route.ts).
import { getPrisma } from "@/lib/prisma";
import { ensureMessagesLoaded } from "./conversations";
import { evaluateConversationWriting } from "@/lib/ai";

const MAX_CANDIDATES_SCANNED = 200; // teto de conversas resolvidas revisitadas por chamada, pra filtrar as pendentes sem SQL de coluna-a-coluna
const MAX_EVALUATIONS_PER_CALL = 15; // teto de chamadas de IA por chamada HTTP, evita timeout

// Limiares em minutos — ajustáveis depois de ver casos reais (não vieram de
// combinação explícita com o usuário, só um ponto de partida razoável dado o
// horário comercial 08-18h/08-17h da 41 Tech).
const FIRST_RESPONSE_THRESHOLDS: [minutes: number, points: number][] = [
  [5, 25],
  [15, 20],
  [30, 15],
  [60, 10],
  [180, 5],
];
const RESOLUTION_THRESHOLDS: [minutes: number, points: number][] = [
  [30, 25],
  [60, 20],
  [180, 15],
  [480, 10],
  [1440, 5],
];

function scoreByThreshold(minutes: number | null, thresholds: [number, number][]): number {
  if (minutes == null) return 0;
  for (const [maxMinutes, points] of thresholds) {
    if (minutes <= maxMinutes) return points;
  }
  return 0;
}

type SlaMessage = { messageType: string; chatwootCreatedAt: Date };

// 25 pts pelo tempo até a 1ª resposta do atendente, 25 pts pelo tempo total
// até a resolução — ambos contados a partir da primeira mensagem do
// atendimento (não necessariamente do cliente, mas normalmente é quem abre).
export function computeSlaScore(messages: SlaMessage[], resolvedAt: Date): number {
  if (messages.length === 0) return 0;
  const first = messages[0];
  const firstCustomerMsg = messages.find((m) => m.messageType === "incoming") ?? first;
  const firstAgentReply = messages.find((m) => m.messageType === "outgoing" && m.chatwootCreatedAt > firstCustomerMsg.chatwootCreatedAt);

  const firstResponseMinutes = firstAgentReply
    ? (firstAgentReply.chatwootCreatedAt.getTime() - firstCustomerMsg.chatwootCreatedAt.getTime()) / 60_000
    : null;
  const resolutionMinutes = (resolvedAt.getTime() - first.chatwootCreatedAt.getTime()) / 60_000;

  return scoreByThreshold(firstResponseMinutes, FIRST_RESPONSE_THRESHOLDS) + scoreByThreshold(resolutionMinutes, RESOLUTION_THRESHOLDS);
}

function buildTranscript(messages: { messageType: string; senderLabel: string | null; content: string | null }[]): string {
  return messages
    .map((m) => `[${m.messageType === "incoming" ? "Cliente" : "Atendente"}${m.senderLabel ? ` - ${m.senderLabel}` : ""}] ${m.content ?? "(sem texto)"}`)
    .join("\n");
}

// Avalia uma conversa específica (já resolvida) e grava/atualiza a
// ConversationEvaluation. Idempotente — pode ser chamado de novo pra
// recalcular (ex: depois que a conversa reabriu e foi resolvida de novo).
export async function evaluateConversation(tenantId: string, conversationId: string): Promise<void> {
  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, resolvedAt: true },
  });
  if (!conversation?.resolvedAt) return;

  await ensureMessagesLoaded(tenantId, conversationId);

  const messages = await prisma.chatwootMessage.findMany({
    where: { conversationId, isPrivate: false, messageType: { not: "activity" } },
    orderBy: { chatwootCreatedAt: "asc" },
    select: { messageType: true, senderLabel: true, content: true, chatwootCreatedAt: true },
  });
  // Sem mensagem de verdade (só atividade/nota interna) — nada pra avaliar.
  if (messages.length === 0) return;

  const slaScore = computeSlaScore(messages, conversation.resolvedAt);
  const { writingScore, reasoning } = await evaluateConversationWriting(tenantId, buildTranscript(messages));
  const clampedWriting = Math.max(0, Math.min(50, Math.round(writingScore)));

  await prisma.conversationEvaluation.upsert({
    where: { conversationId },
    create: {
      tenantId,
      conversationId,
      score: clampedWriting + slaScore,
      writingScore: clampedWriting,
      slaScore,
      reasoning,
      evaluatedAt: new Date(),
    },
    update: {
      score: clampedWriting + slaScore,
      writingScore: clampedWriting,
      slaScore,
      reasoning,
      evaluatedAt: new Date(),
    },
  });
}

export type EvaluationRunResult = { scanned: number; evaluated: number; failed: number };

// Chamado pelo cron (n8n) — busca conversas resolvidas sem nota (ou com nota
// desatualizada, de antes da resolução mais recente — caso de reabertura) e
// avalia um lote pequeno por chamada. A comparação evaluatedAt < resolvedAt é
// feita em memória (não dá pra comparar duas colunas direto no filtro do
// Prisma) — MAX_CANDIDATES_SCANNED limita o custo disso a uma leitura só.
export async function runEvaluationForAllTenants(): Promise<EvaluationRunResult> {
  const prisma = getPrisma();

  const candidates = await prisma.chatwootConversation.findMany({
    where: { resolvedAt: { not: null } },
    orderBy: { resolvedAt: "desc" },
    take: MAX_CANDIDATES_SCANNED,
    select: { id: true, tenantId: true, resolvedAt: true, evaluation: { select: { evaluatedAt: true } } },
  });

  const pending = candidates
    .filter((c) => c.resolvedAt && (!c.evaluation || c.evaluation.evaluatedAt < c.resolvedAt))
    .slice(0, MAX_EVALUATIONS_PER_CALL);

  let evaluated = 0;
  let failed = 0;
  for (const c of pending) {
    try {
      await evaluateConversation(c.tenantId, c.id);
      evaluated++;
    } catch (err) {
      console.error("[chatwoot:evaluation] falha ao avaliar conversa", c.id, err);
      failed++;
    }
  }

  return { scanned: candidates.length, evaluated, failed };
}
