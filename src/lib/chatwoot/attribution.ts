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
  /** "incoming" | "outgoing" | "activity" (ver mappers.ts). */
  messageType: string;
  isPrivate: boolean;
  /** Ordem da mensagem na conversa (`chatwootMessageId` serve). */
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

// Em "outgoing" o remetente já é, por definição do Chatwoot, alguém do lado do
// atendimento — o cliente só produz "incoming". Não dá pra exigir também
// `senderType === "user"`: esse campo vem de `sender.type`, que a API nem
// sempre preenche (`mappers.ts` cai em "unknown"), e quando o filtro rejeita
// tudo a atribuição inteira silenciosamente volta pro `assignee` errado.
function isAgentReply(m: AttributionMessage): boolean {
  return m.messageType === "outgoing" && !m.isPrivate && !!m.senderLabel?.trim();
}

/**
 * Atendente responsável por uma conversa: **quem respondeu ao cliente por
 * último**.
 *
 * A primeira versão contava volume, e volume é o critério errado nesta
 * operação. A recepção abre TODA conversa com um bloco fixo de saudação
 * ("Boa tarde, tudo bem?" / "Como posso lhe ajudar?" / "Fico no aguardo") —
 * três mensagens antes de o cliente sequer falar. Num atendimento resolvido em
 * duas mensagens, a recepcionista ganharia no placar sem ter tratado nada.
 *
 * Quem fecha o atendimento é quem o conduziu. Isso também sobrevive ao padrão
 * de reatribuição automática do Chatwoot: depois de resolvida, a conversa
 * volta pra fila da recepção ("Atribuído a X por Sistema de Automação"), o que
 * envenena o campo `assignee` mas não muda quem falou por último.
 */
export function resolveConversationHandler(
  messages: AttributionMessage[],
  assigneeLabel: string | null,
): ResolvedHandler {
  let last: { label: string; sequence: number } | null = null;

  for (const message of messages) {
    if (!isAgentReply(message)) continue;
    if (last === null || message.sequence > last.sequence) {
      last = { label: message.senderLabel!.trim(), sequence: message.sequence };
    }
  }

  if (last) return { label: last.label, source: "messages" };
  if (assigneeLabel?.trim()) return { label: assigneeLabel.trim(), source: "assignee" };
  return { label: null, source: "unknown" };
}
