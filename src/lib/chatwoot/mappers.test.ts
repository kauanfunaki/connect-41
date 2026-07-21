import { describe, it, expect } from "vitest";
import { normalizeConversation, normalizeMessage } from "./mappers";
import type { ChatwootApiConversation, ChatwootApiMessage } from "./types";

describe("normalizeConversation", () => {
  it("extrai contato, atendente e equipe do meta quando presentes", () => {
    const raw: ChatwootApiConversation = {
      id: 42,
      inbox_id: 3,
      status: "open",
      priority: "high",
      labels: ["vip"],
      unread_count: 2,
      channel: "Channel::WebWidget",
      timestamp: 1_700_000_000,
      last_non_activity_message: { content: "Olá, tudo bem?" },
      meta: {
        sender: { id: 7, name: "Fulano", email: "fulano@ex.com", phone_number: "47999998888" },
        assignee: { id: 1, name: "Atendente A" },
        team: { id: 2, name: "Suporte" },
      },
    };

    const result = normalizeConversation(raw);
    expect(result.chatwootConversationId).toBe(42);
    expect(result.assigneeLabel).toBe("Atendente A");
    expect(result.teamLabel).toBe("Suporte");
    expect(result.contact).toEqual({ chatwootContactId: 7, name: "Fulano", email: "fulano@ex.com", phone: "47999998888" });
    expect(result.lastActivityAt?.getTime()).toBe(1_700_000_000 * 1000);
  });

  it("lê o canal de meta.channel quando ausente na raiz (formato da listagem da Application API)", () => {
    const raw: ChatwootApiConversation = {
      id: 2,
      inbox_id: 1,
      status: "open",
      meta: { channel: "Channel::Whatsapp" },
    };
    expect(normalizeConversation(raw).channel).toBe("Channel::Whatsapp");
  });

  it("não quebra quando meta/sender ausentes (conversa sem contato identificado)", () => {
    const raw: ChatwootApiConversation = { id: 1, inbox_id: 1, status: "resolved" };
    const result = normalizeConversation(raw);
    expect(result.contact).toBeNull();
    expect(result.assigneeLabel).toBeNull();
    expect(result.lastActivityAt).toBeNull();
  });
});

describe("normalizeMessage", () => {
  it("mapeia message_type numérico para o rótulo interno", () => {
    const raw: ChatwootApiMessage = {
      id: 100,
      content: "oi",
      message_type: 1,
      content_type: "text",
      private: false,
      created_at: 1_700_000_000,
    };
    expect(normalizeMessage(raw).messageType).toBe("outgoing");
  });

  it("normaliza anexos guardando só URL e metadado, nunca baixando o binário", () => {
    const raw: ChatwootApiMessage = {
      id: 101,
      content: null,
      message_type: 0,
      content_type: "text",
      private: false,
      attachments: [{ id: 1, file_type: "image", file_size: 2048, data_url: "https://cdn.example.com/file.png" }],
      created_at: 1_700_000_000,
    };
    const result = normalizeMessage(raw);
    expect(result.attachments).toEqual([{ fileType: "image", fileSize: 2048, url: "https://cdn.example.com/file.png" }]);
  });

  it("mensagem privada (nota interna) mantém a flag isPrivate", () => {
    const raw: ChatwootApiMessage = { id: 102, content: "nota", message_type: 2, content_type: "text", private: true, created_at: 1_700_000_000 };
    expect(normalizeMessage(raw).isPrivate).toBe(true);
  });
});
