import { describe, expect, it } from "vitest";
import { resolveConversationHandler, type AttributionMessage } from "./attribution";

let seq = 0;

function agent(senderLabel: string, over: Partial<AttributionMessage> = {}): AttributionMessage {
  return { senderLabel, messageType: "outgoing", isPrivate: false, sequence: (seq += 1), ...over };
}

function cliente(): AttributionMessage {
  return { senderLabel: "Cerro Azul", messageType: "incoming", isPrivate: false, sequence: (seq += 1) };
}

// "Atribuído a X por Y", "Conversa foi marcada como resolvida por X" — o
// Chatwoot manda tudo isso como mensagem de sistema.
function sistema(texto: string): AttributionMessage {
  return { senderLabel: texto, messageType: "activity", isPrivate: false, sequence: (seq += 1) };
}

describe("resolveConversationHandler", () => {
  // Transcrição real de um atendimento (Downloads/Atendimento Chatwoot Exemplo.txt).
  // É o caso que motivou a regra: Juliana (recepção) abre com três saudações,
  // encaminha, e Djanane trata e fecha. O `assignee` termina como Juliana
  // porque a automação devolve a conversa pra fila depois de resolvida.
  it("credita quem tratou, não a recepção que abriu e encaminhou", () => {
    const conversa = [
      agent("Juliana Coelho"), // Boa tarde, tudo bem?
      agent("Juliana Coelho"), // Como posso lhe ajudar?
      agent("Juliana Coelho"), // Fico no aguardo para seguir com a tratativa.
      cliente(),
      cliente(),
      agent("Juliana Coelho"), // Um momento, vou encaminhar ao Departamento contábil.
      sistema("Atribuído a Djanane Paixão por Juliana Coelho"),
      cliente(),
      agent("Djanane Paixão"),
      agent("Djanane Paixão"),
      cliente(),
      agent("Djanane Paixão"),
      sistema("Conversa foi marcada como resolvida por Djanane Paixão"),
      sistema("Atribuído a Juliana Coelho por Sistema de Automação"),
      agent("Djanane Paixão"), // Uma excelente sexta feira!
    ];

    expect(resolveConversationHandler(conversa, "Juliana Coelho")).toEqual({
      label: "Djanane Paixão",
      source: "messages",
    });
  });

  // O bloco de saudação da recepção tem 3 mensagens fixas. Num atendimento
  // curto isso supera quem de fato resolveu — por isso a regra NÃO é volume.
  it("não deixa o volume de saudações vencer quem resolveu", () => {
    const conversa = [
      agent("Juliana Coelho"),
      agent("Juliana Coelho"),
      agent("Juliana Coelho"),
      cliente(),
      agent("Djanane Paixão"),
    ];
    expect(resolveConversationHandler(conversa, "Juliana Coelho").label).toBe("Djanane Paixão");
  });

  // O campo assignee do Chatwoot é envenenado pela automação que devolve a
  // conversa pra fila depois de resolvida — a mensagem tem que vencer o campo.
  it("ignora o responsável registrado quando alguém respondeu", () => {
    const result = resolveConversationHandler([cliente(), agent("Djanane Paixão")], "Juliana Coelho");
    expect(result).toEqual({ label: "Djanane Paixão", source: "messages" });
  });

  // Regressão da 1ª versão: ela exigia senderType === "user", e `sender.type`
  // nem sempre vem preenchido — o filtro zerava tudo e caía no assignee.
  it("não depende de senderType pra reconhecer resposta de atendente", () => {
    const result = resolveConversationHandler([agent("Djanane Paixão")], "Juliana Coelho");
    expect(result.source).toBe("messages");
  });

  it("não conta evento de sistema como atendimento", () => {
    const result = resolveConversationHandler(
      [agent("Djanane Paixão"), sistema("Atribuído a Juliana Coelho por Sistema de Automação")],
      null,
    );
    expect(result.label).toBe("Djanane Paixão");
  });

  it("não conta nota interna", () => {
    const result = resolveConversationHandler(
      [agent("Djanane Paixão"), agent("Nathan Maciel", { isPrivate: true })],
      null,
    );
    expect(result.label).toBe("Djanane Paixão");
  });

  it("não conta mensagem do cliente", () => {
    expect(resolveConversationHandler([cliente(), cliente()], null)).toEqual({
      label: null,
      source: "unknown",
    });
  });

  it("usa a sequência, não a ordem do array", () => {
    const primeiro = agent("Juliana Coelho");
    const ultimo = agent("Djanane Paixão");
    expect(resolveConversationHandler([ultimo, primeiro], null).label).toBe("Djanane Paixão");
  });

  it("cai no responsável registrado quando ninguém respondeu", () => {
    expect(resolveConversationHandler([cliente()], "Juliana Coelho")).toEqual({
      label: "Juliana Coelho",
      source: "assignee",
    });
  });

  it("descarta nome em branco", () => {
    expect(resolveConversationHandler([agent("   ")], "  ")).toEqual({ label: null, source: "unknown" });
  });

  it("normaliza espaços em volta do nome", () => {
    expect(resolveConversationHandler([agent("  Djanane Paixão  ")], null).label).toBe("Djanane Paixão");
  });
});
