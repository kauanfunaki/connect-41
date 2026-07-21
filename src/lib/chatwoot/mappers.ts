// Normalização Chatwoot -> forma interna usada pelos upserts em sync.ts e no
// webhook handler. Mantido separado do client.ts para poder testar sem mock de fetch.
import type { ChatwootApiConversation, ChatwootApiMessage, ChatwootAttachment } from "./types";

export type NormalizedConversation = {
  chatwootConversationId: number;
  inboxId: number;
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
    assigneeLabel: raw.meta?.assignee?.name ?? null,
    teamLabel: raw.meta?.team?.name ?? null,
    status: raw.status,
    priority: raw.priority ?? null,
    labels: raw.labels ?? [],
    channel: raw.channel ?? "unknown",
    lastActivityAt: raw.timestamp ? new Date(raw.timestamp * 1000) : null,
    unreadCount: raw.unread_count ?? 0,
    lastMessagePreview: raw.last_non_activity_message?.content?.slice(0, 280) ?? null,
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

function normalizeAttachments(attachments?: ChatwootAttachment[]): NormalizedAttachment[] {
  // Só URL + metadado — nunca baixamos/replicamos o binário do anexo (decisão
  // explícita de LGPD/retenção, ver docs/CHATWOOT_INTEGRATION_FEASIBILITY.md §11).
  return (attachments ?? []).map((a) => ({ fileType: a.file_type, fileSize: a.file_size ?? null, url: a.data_url }));
}

export function normalizeMessage(raw: ChatwootApiMessage): NormalizedMessage {
  return {
    chatwootMessageId: raw.id,
    senderLabel: raw.sender?.name ?? null,
    senderType: raw.sender?.type ?? "unknown",
    messageType: MESSAGE_TYPE_LABEL[raw.message_type] ?? "activity",
    contentType: raw.content_type,
    content: raw.content,
    isPrivate: raw.private,
    attachments: normalizeAttachments(raw.attachments),
    chatwootCreatedAt: new Date(raw.created_at * 1000),
    chatwootUpdatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : null,
  };
}
