// Quem de fato atendeu uma conversa do Chatwoot.
//
// O painel de Avaliação de Atendimentos usava `ChatwootConversation.assigneeId`
// — o responsável ATUAL no Chatwoot. Isso não responde à pergunta que a tela
// faz. Na operação real:
//
// - a recepção recebe TODA conversa e reatribui pra quem vai tratar, então o
//   assignee no meio do caminho é sempre a mesma pessoa;
// - a reatribuição nem sempre acontece, e conversas ficavam creditadas a quem
//   nunca escreveu uma linha pro cliente;
// - quem configurou a integração aparecia como assignee de conversas que nunca
//   tocou, por ser o dono do token na sincronização.
//
// A fonte confiável é a mensagem: quem escreveu PRO CLIENTE atendeu. Notas
// internas (`isPrivate`) não contam — são conversa entre colegas, não
// atendimento —, nem eventos de sistema (`activity`, que é como o próprio
// "atribuído a Fulano" chega).

export type AttributionMessage = {
  senderLabel: string | null;
  /** `sender.type` do Chatwoot: "user" = atendente, "contact" = cliente. */
  senderType: string;
  /** "incoming" | "outgoing" | "activity" (ver mappers.ts). */
  messageType: string;
  isPrivate: boolean;
  /**
   * Ordem da mensagem na conversa (chatwootMessageId serve). Usado só pra
   * desempatar quem falou por último quando dois atendentes empatam em volume.
   */
  sequence: number;
};

export type ResolvedHandler = {
  label: string | null;
  /**
   * "messages" — deduzido de quem escreveu pro cliente (o caso confiável).
   * "assignee" — ninguém escreveu; sobrou o responsável registrado no Chatwoot.
   * "unknown"  — nem mensagem nem responsável.
   */
  source: "messages" | "assignee" | "unknown";
};

function isAgentReply(m: AttributionMessage): boolean {
  return (
    m.messageType === "outgoing" &&
    m.senderType.toLowerCase() === "user" &&
    !m.isPrivate &&
    !!m.senderLabel?.trim()
  );
}

/**
 * Atendente responsável por uma conversa.
 *
 * Vence quem mais respondeu ao cliente. O desempate é a resposta mais recente
 * — numa conversa dividida meio a meio, quem fechou o atendimento é a escolha
 * mais defensável (e é determinístico, não depende da ordem de chegada).
 */
export function resolveConversationHandler(
  messages: AttributionMessage[],
  assigneeLabel: string | null,
): ResolvedHandler {
  const byLabel = new Map<string, { count: number; lastSequence: number }>();

  for (const message of messages) {
    if (!isAgentReply(message)) continue;
    const label = message.senderLabel!.trim();
    const existing = byLabel.get(label);
    if (existing) {
      existing.count += 1;
      existing.lastSequence = Math.max(existing.lastSequence, message.sequence);
    } else {
      byLabel.set(label, { count: 1, lastSequence: message.sequence });
    }
  }

  let winner: { label: string; count: number; lastSequence: number } | null = null;
  for (const [label, stats] of byLabel) {
    if (
      winner === null ||
      stats.count > winner.count ||
      (stats.count === winner.count && stats.lastSequence > winner.lastSequence)
    ) {
      winner = { label, ...stats };
    }
  }

  if (winner) return { label: winner.label, source: "messages" };
  if (assigneeLabel?.trim()) return { label: assigneeLabel.trim(), source: "assignee" };
  return { label: null, source: "unknown" };
}
