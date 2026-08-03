import { getPrisma } from "@/lib/prisma";
import { resolveConversationHandler, type ResolvedHandler } from "./attribution";

export type ConversationRef = { id: string; assigneeLabel: string | null };

/**
 * Responsável real de cada conversa (ver `attribution.ts` para a regra).
 *
 * O recorte pesado fica no banco (`outgoing` e não-privada eliminam a maior
 * parte das linhas), mas quem decide o vencedor é a função pura testada — a
 * regra não é reescrita em SQL, senão passariam a existir duas versões dela
 * que envelhecem separado.
 */
export async function resolveHandlersForConversations(
  tenantId: string,
  conversations: ConversationRef[],
): Promise<Map<string, ResolvedHandler>> {
  const resolved = new Map<string, ResolvedHandler>();
  if (conversations.length === 0) return resolved;

  const messages = await getPrisma().chatwootMessage.findMany({
    where: {
      tenantId,
      conversationId: { in: conversations.map((c) => c.id) },
      messageType: "outgoing",
      isPrivate: false,
    },
    select: {
      conversationId: true,
      senderLabel: true,
      senderType: true,
      messageType: true,
      isPrivate: true,
      chatwootMessageId: true,
    },
  });

  const byConversation = new Map<string, Parameters<typeof resolveConversationHandler>[0]>();
  for (const m of messages) {
    const list = byConversation.get(m.conversationId) ?? [];
    list.push({
      senderLabel: m.senderLabel,
      senderType: m.senderType,
      messageType: m.messageType,
      isPrivate: m.isPrivate,
      sequence: m.chatwootMessageId,
    });
    byConversation.set(m.conversationId, list);
  }

  for (const conversation of conversations) {
    resolved.set(
      conversation.id,
      resolveConversationHandler(byConversation.get(conversation.id) ?? [], conversation.assigneeLabel),
    );
  }

  return resolved;
}
