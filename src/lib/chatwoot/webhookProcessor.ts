// Aplica um evento de webhook já autenticado (assinatura verificada) e
// deduplicado (ChatwootWebhookEvent) ao banco local. Reaproveita os mesmos
// upserts da sincronização em lote (sync.ts) — mesma forma de dado, fonte diferente.
import { getPrisma } from "@/lib/prisma";
import { normalizeConversation, normalizeMessage } from "./mappers";
import { upsertConversation, upsertContactLink } from "./sync";
import type { ChatwootWebhookPayload } from "./types";

export async function processWebhookEvent(tenantId: string, connectionId: string, payload: ChatwootWebhookPayload): Promise<void> {
  const prisma = getPrisma();

  if (payload.event === "conversation_created" || payload.event === "conversation_updated" || payload.event === "conversation_status_changed") {
    if (!payload.conversation) return;
    const normalized = normalizeConversation(payload.conversation);
    await upsertConversation(prisma, tenantId, connectionId, normalized);
    return;
  }

  if (payload.event === "message_created" || payload.event === "message_updated") {
    if (!payload.conversation || payload.id == null) return;
    const normalizedConversation = normalizeConversation(payload.conversation);
    const { id: conversationId } = await upsertConversation(prisma, tenantId, connectionId, normalizedConversation);

    const normalizedMessage = normalizeMessage({
      id: payload.id,
      content: payload.content ?? null,
      message_type: payload.message_type ?? 2,
      content_type: payload.content_type ?? "text",
      private: payload.private ?? false,
      attachments: payload.attachments,
      sender: payload.sender,
      created_at: typeof payload.created_at === "number" ? payload.created_at : Math.floor(Date.now() / 1000),
      updated_at: typeof payload.updated_at === "number" ? payload.updated_at : undefined,
    });

    await prisma.chatwootMessage.upsert({
      where: { tenantId_conversationId_chatwootMessageId: { tenantId, conversationId, chatwootMessageId: normalizedMessage.chatwootMessageId } },
      create: {
        tenantId,
        conversationId,
        chatwootMessageId: normalizedMessage.chatwootMessageId,
        senderLabel: normalizedMessage.senderLabel,
        senderType: normalizedMessage.senderType,
        messageType: normalizedMessage.messageType,
        contentType: normalizedMessage.contentType,
        content: normalizedMessage.content,
        isPrivate: normalizedMessage.isPrivate,
        attachments: normalizedMessage.attachments,
        chatwootCreatedAt: normalizedMessage.chatwootCreatedAt,
        chatwootUpdatedAt: normalizedMessage.chatwootUpdatedAt,
      },
      update: {
        content: normalizedMessage.content,
        isPrivate: normalizedMessage.isPrivate,
        attachments: normalizedMessage.attachments,
        chatwootUpdatedAt: normalizedMessage.chatwootUpdatedAt,
        syncedAt: new Date(),
      },
    });
    return;
  }

  if (payload.event === "contact_created" || payload.event === "contact_updated") {
    // Payload de contact_* traz o contato no topo (id/name/email/phone_number),
    // fora do shape de ChatwootWebhookPayload tipado acima — lido de forma
    // solta aqui pra não inflar o tipo principal com um caso raro.
    const raw = payload as unknown as { id?: number; name?: string; email?: string; phone_number?: string };
    if (raw.id == null) return;

    // Só reprocessa vínculo se já existir uma linha pra este contato (criada
    // via alguma conversa sincronizada) — contato "novo" sem conversa ainda
    // não tem com o que ser vinculado.
    const prismaClient = getPrisma();
    const existing = await prismaClient.chatwootContactLink.findUnique({
      where: { tenantId_connectionId_chatwootContactId: { tenantId, connectionId, chatwootContactId: raw.id } },
    });
    if (!existing || existing.linkMethod === "MANUAL") return;

    await upsertContactLink(prismaClient, tenantId, connectionId, {
      chatwootContactId: raw.id,
      name: raw.name ?? null,
      email: raw.email ?? null,
      phone: raw.phone_number ?? null,
    });
  }
}
