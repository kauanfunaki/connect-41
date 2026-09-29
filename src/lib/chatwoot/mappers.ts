// Normalização Chatwoot -> forma interna usada pelos upserts em sync.ts e no
// webhook handler. Mantido separado do client.ts para poder testar sem mock de fetch.
import type { ChatwootApiConversation, ChatwootApiMessage, ChatwootAttachment, ChatwootWebhookPayload } from "./types";

export type NormalizedConversation = {
  chatwootConversationId: number;
  inboxId: number;
  assigneeId: number | null;
  assigneeLabel: string | null;
  teamLabel: string | null;
  status: string;
  priority: string | null;
  labels: string[];
  channel: string;
  lastActivityAt: Date | null;
  unreadCount: number;
  lastMessagePreview: string | null;
  contact: { chatwootContactId: number; name: string | null; email: string | null; phone: string | null } | null;
};

export function normalizeConversation(raw: ChatwootApiConversation): NormalizedConversation {
  const sender = raw.meta?.sender;
  return {
    chatwootConversationId: raw.id,
    inboxId: raw.inbox_id,
    assigneeId: raw.meta?.assignee?.id ?? null,
    assigneeLabel: raw.meta?.assignee?.name ?? null,
    teamLabel: raw.meta?.team?.name ?? null,
    status: raw.status,
    priority: raw.priority ?? null,
    labels: raw.labels ?? [],
    channel: raw.channel ?? raw.meta?.channel ?? "unknown",
    lastActivityAt: raw.timestamp ? new Date(raw.timestamp * 1000) : null,
    unreadCount: raw.unread_count ?? 0,
    lastMessagePreview: (raw.last_non_activity_message?.content ?? lastNonActivityContent(raw.messages))?.slice(0, 280) ?? null,
    contact: sender
      ? { chatwootContactId: sender.id, name: sender.name ?? null, email: sender.email ?? null, phone: sender.phone_number ?? null }
      : null,
  };
}

export type NormalizedMessage = {
  chatwootMessageId: number;
  senderLabel: string | null;
  senderType: string;
  messageType: "incoming" | "outgoing" | "activity";
  contentType: string;
  content: string | null;
  isPrivate: boolean;
  attachments: NormalizedAttachment[];
  chatwootCreatedAt: Date;
  chatwootUpdatedAt: Date | null;
};

export type NormalizedAttachment = { fileType: string; fileSize: number | null; url: string };

const MESSAGE_TYPE_LABEL: Record<number, NormalizedMessage["messageType"]> = {
  0: "incoming",
  1: "outgoing",
  2: "activity",
};

// O webhook de mensagem manda o nome do enum em vez do número. Template (3)
// fica como atividade, igual ao que a sincronização pela API já fazia.
const MESSAGE_TYPE_BY_NAME: Record<string, NormalizedMessage["messageType"]> = {
  incoming: "incoming",
  outgoing: "outgoing",
  activity: "activity",
};

export function messageTypeLabel(value: number | string | null | undefined): NormalizedMessage["messageType"] {
  if (typeof value === "string") return MESSAGE_TYPE_BY_NAME[value] ?? "activity";
  if (typeof value === "number") return MESSAGE_TYPE_LABEL[value] ?? "activity";
  return "activity";
}

/**
 * Instante do Chatwoot em segundos unix. A API e os payloads de conversa mandam
 * número; o webhook de mensagem manda ISO 8601 (`created_at` do Rails).
 */
export function toUnixSeconds(value: string | number | null | undefined): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.floor(value) : undefined;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : Math.floor(ms / 1000);
  }
  return undefined;
}

function lastNonActivityContent(messages: ChatwootApiConversation["messages"]): string | null {
  const last = [...(messages ?? [])].reverse().find((m) => !m.private && messageTypeLabel(m.message_type) !== "activity");
  return last?.content ?? null;
}

/**
 * A conversa de um evento de webhook. Em message_* ela vem aninhada em
 * `conversation`; em conversation_* o payload inteiro é a conversa
 * (Conversation#webhook_data com `event` junto).
 */
export function conversationFromWebhook(payload: ChatwootWebhookPayload): ChatwootApiConversation | null {
  if (payload.conversation) return payload.conversation;
  const top = payload as unknown as Partial<ChatwootApiConversation>;
  if (typeof top.id === "number" && typeof top.inbox_id === "number" && typeof top.status === "string") {
    return top as ChatwootApiConversation;
  }
  return null;
}

function normalizeAttachments(attachments?: ChatwootAttachment[]): NormalizedAttachment[] {
  // Só URL + metadado — nunca baixamos/replicamos o binário do anexo (decisão
  // explícita de LGPD/retenção, ver docs/CHATWOOT_INTEGRATION_FEASIBILITY.md §11).
  return (attachments ?? []).filter((a) => !!a.data_url).map((a) => ({ fileType: a.file_type, fileSize: a.file_size ?? null, url: a.data_url! }));
}

export function normalizeMessage(raw: ChatwootApiMessage): NormalizedMessage {
  return {
    chatwootMessageId: raw.id,
    senderLabel: raw.sender?.name ?? null,
    senderType: raw.sender?.type ?? "unknown",
    messageType: messageTypeLabel(raw.message_type),
    contentType: raw.content_type,
    content: raw.content,
    isPrivate: raw.private,
    attachments: normalizeAttachments(raw.attachments),
    chatwootCreatedAt: new Date(raw.created_at * 1000),
    chatwootUpdatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : null,
  };
}
