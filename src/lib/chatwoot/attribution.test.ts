import { describe, expect, it } from "vitest";
import { resolveConversationHandler, type AttributionMessage } from "./attribution";

let seq = 0;

function agentReply(senderLabel: string, over: Partial<AttributionMessage> = {}): AttributionMessage {
  return {
    senderLabel,
    senderType: "user",
    messageType: "outgoing",
    isPrivate: false,
    sequence: (seq += 1),
    ...over,
  };
}

function customerMessage(): AttributionMessage {
  return { senderLabel: "Cliente", senderType: "contact", messageType: "incoming", isPrivate: false, sequence: (seq += 1) };
}

describe("resolveConversationHandler", () => {
  it("credita quem respondeu ao cliente", () => {
    const result = resolveConversationHandler(
      [customerMessage(), agentReply("Marina"), agentReply("Marina")],
      null,
    );
    expect(result).toEqual({ label: "Marina", source: "messages" });
  });

  // O caso relatado: a recepção recebe tudo e reatribui. Ela costuma mandar uma
  // saudação, mas quem tratou escreve muito mais — o volume tem que decidir.
  it("prefere quem tratou à recepção que só encaminhou", () => {
    const result = resolveConversationHandler(
      [
        customerMessage(),
        agentReply("Juliana Coelho"),
        agentReply("Marina"),
        agentReply("Marina"),
        agentReply("Marina"),
      ],
      "Juliana Coelho",
    );
    expect(result.label).toBe("Marina");
  });

  // O outro caso relatado: o assignee registrado no Chatwoot é alguém que nunca
  // escreveu (dono do token da integração). A mensagem tem que vencer o campo.
  it("ignora o responsável registrado quando ele não escreveu nada", () => {
    const result = resolveConversationHandler(
      [customerMessage(), agentReply("Marina")],
      "Nathan Maciel",
    );
    expect(result).toEqual({ label: "Marina", source: "messages" });
  });

  it("não conta nota interna como atendimento", () => {
    const result = resolveConversationHandler(
      [customerMessage(), agentReply("Nathan Maciel", { isPrivate: true }), agentReply("Marina")],
      null,
    );
    expect(result.label).toBe("Marina");
  });

  // "Fulano atribuiu a conversa a Beltrano" chega como mensagem de sistema.
  it("não conta evento de sistema", () => {
    const result = resolveConversationHandler(
      [agentReply("Sistema", { messageType: "activity" }), agentReply("Marina")],
      null,
    );
    expect(result.label).toBe("Marina");
  });

  it("não conta mensagem do próprio cliente", () => {
    const result = resolveConversationHandler([customerMessage(), customerMessage()], null);
    expect(result).toEqual({ label: null, source: "unknown" });
  });

  it("desempata pela resposta mais recente", () => {
    const primeiro = agentReply("Marina");
    const ultimo = agentReply("Rafael");
    const result = resolveConversationHandler([primeiro, ultimo], null);
    expect(result.label).toBe("Rafael");
  });

  it("não depende da ordem do array", () => {
    const marina = [agentReply("Marina"), agentReply("Marina")];
    const rafael = [agentReply("Rafael")];
    const emUmaOrdem = resolveConversationHandler([...marina, ...rafael], null);
    const naOutra = resolveConversationHandler([...rafael, ...marina], null);
    expect(emUmaOrdem.label).toBe("Marina");
    expect(naOutra.label).toBe("Marina");
  });

  it("cai no responsável registrado quando nenhum atendente escreveu", () => {
    const result = resolveConversationHandler([customerMessage()], "Juliana Coelho");
    expect(result).toEqual({ label: "Juliana Coelho", source: "assignee" });
  });

  it("descarta nome em branco", () => {
    const result = resolveConversationHandler([agentReply("   ")], "  ");
    expect(result).toEqual({ label: null, source: "unknown" });
  });

  it("normaliza espaços em volta do nome", () => {
    const result = resolveConversationHandler([agentReply("  Marina  ")], null);
    expect(result.label).toBe("Marina");
  });

  it("aceita senderType em qualquer caixa", () => {
    const result = resolveConversationHandler([agentReply("Marina", { senderType: "User" })], null);
    expect(result.label).toBe("Marina");
  });
});
