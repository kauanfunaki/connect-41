// Leitura de conversas/mensagens já sincronizadas + carregamento sob demanda
// do corpo de mensagens (não replicado na sincronização em lote, ver sync.ts).
import { getPrisma } from "@/lib/prisma";
import { resolveConnectionCredentials } from "./connection";
import { listMessages } from "./client";
import { normalizeMessage } from "./mappers";

const MESSAGES_PAGE_SIZE = 20;

// Garante que a conversa tenha ao menos a primeira leva de mensagens
// carregada localmente — chamado ao abrir uma conversa pela primeira vez.
export async function ensureMessagesLoaded(tenantId: string, conversationLocalId: string): Promise<void> {
  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationLocalId, tenantId },
    select: { id: true, connectionId: true, chatwootConversationId: true },
  });
  if (!conversation) return;

  const existingCount = await prisma.chatwootMessage.count({ where: { conversationId: conversation.id } });
  if (existingCount > 0) return;

  const resolved = await resolveConnectionCredentials(tenantId);
  if (!resolved || resolved.connectionId !== conversation.connectionId) return;

  const page = await listMessages(resolved.creds, conversation.chatwootConversationId);
  await persistMessages(tenantId, conversation.id, page.payload);
}

export async function loadOlderMessages(tenantId: string, conversationLocalId: string): Promise<{ loaded: number }> {
  const prisma = getPrisma();
  const conversation = await prisma.chatwootConversation.findFirst({
    where: { id: conversationLocalId, tenantId },
    select: { id: true, connectionId: true, chatwootConversationId: true },
  });
  if (!conversation) return { loaded: 0 };

  const oldest = await prisma.chatwootMessage.findFirst({
    where: { conversationId: conversation.id },
    orderBy: { chatwootMessageId: "asc" },
    select: { chatwootMessageId: true },
  });
  if (!oldest) {
    await ensureMessagesLoaded(tenantId, conversationLocalId);
    return { loaded: await prisma.chatwootMessage.count({ where: { conversationId: conversation.id } }) };
  }

  const resolved = await resolveConnectionCredentials(tenantId);
  if (!resolved || resolved.connectionId !== conversation.connectionId) return { loaded: 0 };

  const page = await listMessages(resolved.creds, conversation.chatwootConversationId, oldest.chatwootMessageId);
  await persistMessages(tenantId, conversation.id, page.payload);
  return { loaded: page.payload.length };
}

async function persistMessages(tenantId: string, conversationId: string, rawMessages: Parameters<typeof normalizeMessage>[0][]): Promise<void> {
  const prisma = getPrisma();
  for (const raw of rawMessages) {
    const normalized = normalizeMessage(raw);
    await prisma.chatwootMessage.upsert({
      where: { tenantId_conversationId_chatwootMessageId: { tenantId, conversationId, chatwootMessageId: normalized.chatwootMessageId } },
      create: {
        tenantId,
        conversationId,
        chatwootMessageId: normalized.chatwootMessageId,
        senderLabel: normalized.senderLabel,
        senderType: normalized.senderType,
        messageType: normalized.messageType,
        contentType: normalized.contentType,
        content: normalized.content,
        isPrivate: normalized.isPrivate,
        attachments: normalized.attachments,
        chatwootCreatedAt: normalized.chatwootCreatedAt,
        chatwootUpdatedAt: normalized.chatwootUpdatedAt,
      },
      update: {
        content: normalized.content,
        attachments: normalized.attachments,
        chatwootUpdatedAt: normalized.chatwootUpdatedAt,
        syncedAt: new Date(),
      },
    });
  }
}

export { MESSAGES_PAGE_SIZE };
