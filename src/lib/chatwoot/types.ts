// Tipos mínimos da Application API do Chatwoot 4.15 — só os campos que o
// Connect efetivamente consome (não é um SDK completo).

export type ChatwootAttachment = {
  id: number;
  file_type: string;
  file_size?: number;
  data_url: string;
};

export type ChatwootSender = {
  id: number;
  name?: string;
  type?: string; // "contact" | "user" | "agent_bot"
};

export type ChatwootApiMessage = {
  id: number;
  content: string | null;
  message_type: number; // 0 = incoming, 1 = outgoing, 2 = activity/template
  content_type: string; // "text", "input_select", etc.
  private: boolean;
  attachments?: ChatwootAttachment[];
  sender?: ChatwootSender;
  created_at: number; // unix seconds
  updated_at?: number;
};

export type ChatwootApiContact = {
  id: number;
  name?: string;
  email?: string | null;
  phone_number?: string | null;
};

export type ChatwootApiConversation = {
  id: number;
  inbox_id: number;
  status: string; // "open" | "resolved" | "pending" | "snoozed"
  priority?: string | null;
  labels?: string[];
  unread_count?: number;
  // Na prática o canal vem dentro de meta.channel na listagem da Application
  // API (raiz só em alguns payloads de webhook) — o mapper tenta os dois.
  channel?: string;
  meta?: {
    sender?: ChatwootApiContact;
    channel?: string;
    assignee?: { id: number; name?: string } | null;
    team?: { id: number; name?: string } | null;
  };
  timestamp?: number; // last activity, unix seconds
  last_non_activity_message?: { content?: string | null } | null;
};

export type ChatwootConversationsPage = {
  data: {
    meta: { count: number; current_page?: number };
    payload: ChatwootApiConversation[];
  };
};

export type ChatwootMessagesPage = {
  payload: ChatwootApiMessage[];
};

// Eventos de webhook relevantes (Chatwoot 4.15) — payload real tem muito mais
// campos; só tipamos o que src/lib/chatwoot/mappers.ts consome.
export type ChatwootWebhookEventType =
  | "conversation_created"
  | "conversation_updated"
  | "conversation_status_changed"
  | "message_created"
  | "message_updated"
  | "contact_created"
  | "contact_updated";

export type ChatwootWebhookPayload = {
  event: ChatwootWebhookEventType;
  id?: number; // presente em message_* (id da mensagem)
  account?: { id: number };
  conversation?: ChatwootApiConversation & { account_id?: number };
  content?: string | null;
  message_type?: number;
  content_type?: string;
  private?: boolean;
  sender?: ChatwootSender;
  attachments?: ChatwootAttachment[];
  created_at?: string | number;
  updated_at?: string | number;
};
