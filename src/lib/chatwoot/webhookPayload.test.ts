// Payloads no formato que o Chatwoot 4.18 manda de verdade (Message#webhook_data,
// Conversation#webhook_data, Contact#webhook_data). Até 29/09 o webhook nunca
// tinha sido aceito, e estes formatos nunca tinham passado pelo Connect: o
// `message_created` voltava 422 e o de conversa/contato perdia os campos.
import { describe, it, expect } from "vitest";
import { chatwootWebhookEventSchema } from "./schemas";
import { conversationFromWebhook, messageTypeLabel, normalizeConversation, normalizeMessage, toUnixSeconds } from "./mappers";
import type { ChatwootWebhookPayload } from "./types";

const conversa = {
  additional_attributes: {},
  can_reply: true,
  channel: "Channel::Api",
  contact_inbox: { source_id: "abc" },
  id: 812,
  inbox_id: 4,
  messages: [
    { id: 9001, content: "Bom dia, preciso da guia", message_type: 0, private: false },
    { id: 9002, content: "Conversa marcada como resolvida", message_type: 2, private: false },
  ],
  labels: ["fiscal"],
  meta: {
    sender: { id: 555, name: "Maria Cliente", email: null, phone_number: "+5547999998888", type: "contact" },
    assignee: { id: 3, name: "Atendente A" },
    team: null,
  },
  status: "resolved",
  unread_count: 0,
  timestamp: 1_790_000_000,
  created_at: 1_789_990_000,
  updated_at: 1_790_000_000.123,
};

const mensagem = {
  event: "message_created",
  account: { id: 1, name: "41" },
  additional_attributes: {},
  content_attributes: {},
  content_type: "text",
  content: "Bom dia, preciso da guia",
  conversation: conversa,
  created_at: "2026-09-29T16:20:05.123Z",
  id: 9001,
  inbox: { id: 4, name: "Grupo 41" },
  message_type: "incoming",
  private: false,
  sender: { account: { id: 1 }, id: 555, name: "Maria Cliente", phone_number: "+5547999998888", email: null, blocked: false },
  source_id: "wamid.x",
};

describe("webhook do Chatwoot 4.18", () => {
  it("aceita o message_created com message_type em texto e created_at em ISO", () => {
    const r = chatwootWebhookEventSchema.safeParse(mensagem);
    expect(r.success).toBe(true);
  });

  it("aceita mensagem de atividade sem remetente (sender: null)", () => {
    const r = chatwootWebhookEventSchema.safeParse({ ...mensagem, message_type: "activity", sender: null });
    expect(r.success).toBe(true);
  });

  it("normaliza a mensagem do webhook como a da API", () => {
    const p = chatwootWebhookEventSchema.parse(mensagem) as unknown as ChatwootWebhookPayload;
    const m = normalizeMessage({
      id: p.id!,
      content: p.content ?? null,
      message_type: p.message_type ?? 2,
      content_type: p.content_type ?? "text",
      private: p.private ?? false,
      sender: p.sender ?? undefined,
      created_at: toUnixSeconds(p.created_at)!,
    });
    expect(m.messageType).toBe("incoming");
    expect(m.senderLabel).toBe("Maria Cliente");
    expect(m.chatwootCreatedAt.toISOString()).toBe("2026-09-29T16:20:05.000Z");
  });

  it("mantém no topo os campos da conversa em conversation_status_changed", () => {
    const p = chatwootWebhookEventSchema.parse({ ...conversa, event: "conversation_status_changed", changed_attributes: [] });
    const c = conversationFromWebhook(p as unknown as ChatwootWebhookPayload);
    expect(c).not.toBeNull();
    const n = normalizeConversation(c!);
    expect(n.status).toBe("resolved");
    expect(n.contact).toEqual({ chatwootContactId: 555, name: "Maria Cliente", email: null, phone: "+5547999998888" });
    expect(n.assigneeLabel).toBe("Atendente A");
    // Sem last_non_activity_message: a prévia vem da última mensagem que não é atividade.
    expect(n.lastMessagePreview).toBe("Bom dia, preciso da guia");
  });

  it("em message_created a conversa vem aninhada", () => {
    const p = chatwootWebhookEventSchema.parse(mensagem) as unknown as ChatwootWebhookPayload;
    expect(conversationFromWebhook(p)?.id).toBe(812);
  });

  it("mantém nome e telefone do contato em contact_updated", () => {
    const p = chatwootWebhookEventSchema.parse({
      event: "contact_updated",
      account: { id: 1, name: "41" },
      id: 555,
      name: "Maria Cliente",
      email: null,
      phone_number: "+5547999998888",
      changed_attributes: [],
    }) as Record<string, unknown>;
    expect(p.name).toBe("Maria Cliente");
    expect(p.phone_number).toBe("+5547999998888");
    expect(conversationFromWebhook(p as unknown as ChatwootWebhookPayload)).toBeNull();
  });
});

describe("messageTypeLabel", () => {
  it("lê número (API) e nome (webhook)", () => {
    expect(messageTypeLabel(0)).toBe("incoming");
    expect(messageTypeLabel(1)).toBe("outgoing");
    expect(messageTypeLabel("incoming")).toBe("incoming");
    expect(messageTypeLabel("outgoing")).toBe("outgoing");
  });

  it("template e desconhecido ficam como atividade", () => {
    expect(messageTypeLabel(3)).toBe("activity");
    expect(messageTypeLabel("template")).toBe("activity");
    expect(messageTypeLabel(undefined)).toBe("activity");
  });
});

describe("toUnixSeconds", () => {
  it("aceita número e ISO, e recusa o resto", () => {
    expect(toUnixSeconds(1_790_000_000.9)).toBe(1_790_000_000);
    expect(toUnixSeconds("2026-09-29T16:20:05.123Z")).toBe(Math.floor(Date.parse("2026-09-29T16:20:05Z") / 1000));
    expect(toUnixSeconds("ontem")).toBeUndefined();
    expect(toUnixSeconds(null)).toBeUndefined();
  });
});
