import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { lerMensagens, apenasStatus } from "./payload";
import { verificarAssinaturaDaMeta, responderDesafio } from "./assinatura";

function envelope(messages: unknown[], contacts: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "554199999999", phone_number_id: "PN1" },
              contacts,
              messages,
              ...extra,
            },
          },
        ],
      },
    ],
  };
}

const TEXTO = (id: string, from = "5541988887777", body = "oi") => ({
  id,
  from,
  timestamp: "1789000000",
  type: "text",
  text: { body },
});

describe("lerMensagens", () => {
  it("lê uma mensagem de texto inteira", () => {
    const { mensagens } = lerMensagens(
      envelope([TEXTO("wamid.1")], [{ wa_id: "5541988887777", profile: { name: "Ana" } }])
    );
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]).toMatchObject({
      waMessageId: "wamid.1",
      de: "5541988887777",
      paraPhoneNumberId: "PN1",
      texto: "oi",
      nomeDoPerfil: "Ana",
    });
  });

  // A Meta entrega em lote quando o webhook fica fora do ar. Perder a segunda
  // é perder a pergunta do candidato sem ninguém notar.
  it("lê TODAS as mensagens de um lote, não só a primeira", () => {
    const { mensagens } = lerMensagens(
      envelope([TEXTO("wamid.1", "5541988887777", "oi"), TEXTO("wamid.2", "5541977776666", "olá")])
    );
    expect(mensagens.map((m) => m.waMessageId)).toEqual(["wamid.1", "wamid.2"]);
  });

  it("lê mensagens de várias entradas e mudanças", () => {
    const a = envelope([TEXTO("wamid.1")]);
    const b = envelope([TEXTO("wamid.2")]);
    const juntos = { entry: [...a.entry, ...b.entry] };
    expect(lerMensagens(juntos).mensagens).toHaveLength(2);
  });

  // Responder a um áudio com um robô que não o ouviu é pior que não responder.
  it("áudio, imagem e documento não viram mensagem — viram ignorada", () => {
    const { mensagens, ignoradas } = lerMensagens(
      envelope([
        { id: "w1", from: "5541988887777", timestamp: "1789000000", type: "audio", audio: { id: "a" } },
        { id: "w2", from: "5541988887777", timestamp: "1789000000", type: "image", image: { id: "i" } },
      ])
    );
    expect(mensagens).toHaveLength(0);
    expect(ignoradas.map((i) => i.tipo)).toEqual(["audio", "image"]);
  });

  it("texto sem corpo é ignorado, não vira string vazia", () => {
    const { mensagens, ignoradas } = lerMensagens(
      envelope([{ id: "w1", from: "5541988887777", timestamp: "1789000000", type: "text", text: {} }])
    );
    expect(mensagens).toHaveLength(0);
    expect(ignoradas).toHaveLength(1);
  });

  it("mensagem sem id ou sem remetente é descartada", () => {
    const { mensagens } = lerMensagens(
      envelope([
        { from: "5541988887777", timestamp: "1", type: "text", text: { body: "x" } },
        { id: "w2", timestamp: "1", type: "text", text: { body: "x" } },
      ])
    );
    expect(mensagens).toHaveLength(0);
  });

  it("timestamp inválido não derruba nem vira Invalid Date", () => {
    const { mensagens } = lerMensagens(
      envelope([{ id: "w1", from: "5541988887777", timestamp: "vixe", type: "text", text: { body: "oi" } }])
    );
    expect(mensagens[0]!.recebidaEm.getTime()).not.toBeNaN();
  });

  it("lixo, nulo e formato inesperado devolvem lista vazia", () => {
    for (const v of [null, undefined, 42, "texto", {}, { entry: "nao-e-array" }, []]) {
      expect(lerMensagens(v).mensagens).toEqual([]);
    }
  });
});

describe("apenasStatus", () => {
  // É a maior parte do volume. Distinguir evita tratar "sua mensagem foi lida"
  // como se fosse pergunta de candidato.
  it("entrega só com statuses é reconhecida", () => {
    expect(apenasStatus(envelope([], [], { statuses: [{ id: "w1", status: "read" }] }))).toBe(true);
  });

  it("entrega com mensagem não é só status", () => {
    expect(apenasStatus(envelope([TEXTO("wamid.1")], [], { statuses: [{ id: "w0" }] }))).toBe(false);
  });

  it("envelope vazio não é status", () => {
    expect(apenasStatus(envelope([]))).toBe(false);
  });
});

describe("verificarAssinaturaDaMeta", () => {
  const SEGREDO = "app-secret-da-bm";
  const corpo = JSON.stringify({ oi: "mundo" });
  const assinatura = `sha256=${createHmac("sha256", SEGREDO).update(corpo, "utf8").digest("hex")}`;

  it("assinatura correta passa", () => {
    expect(verificarAssinaturaDaMeta(corpo, assinatura, SEGREDO)).toEqual({ ok: true });
  });

  it("corpo alterado não passa", () => {
    expect(verificarAssinaturaDaMeta(corpo + " ", assinatura, SEGREDO).ok).toBe(false);
  });

  it("segredo errado não passa", () => {
    expect(verificarAssinaturaDaMeta(corpo, assinatura, "outro").ok).toBe(false);
  });

  it("sem cabeçalho não passa", () => {
    expect(verificarAssinaturaDaMeta(corpo, null, SEGREDO).ok).toBe(false);
  });

  it("sem segredo configurado não passa", () => {
    expect(verificarAssinaturaDaMeta(corpo, assinatura, "").ok).toBe(false);
  });

  // `timingSafeEqual` lança com buffers de tamanhos diferentes, e um throw aqui
  // viraria 500 — que para a Meta significa "tente de novo".
  it("cabeçalho de tamanho diferente recusa em vez de explodir", () => {
    expect(() => verificarAssinaturaDaMeta(corpo, "sha256=curto", SEGREDO)).not.toThrow();
    expect(verificarAssinaturaDaMeta(corpo, "sha256=curto", SEGREDO).ok).toBe(false);
  });
});

describe("responderDesafio", () => {
  it("devolve o challenge quando o token confere", () => {
    expect(
      responderDesafio({ mode: "subscribe", token: "abc", challenge: "123", verifyToken: "abc" })
    ).toEqual({ ok: true, challenge: "123" });
  });

  it("token errado, modo errado ou challenge ausente recusam", () => {
    expect(responderDesafio({ mode: "subscribe", token: "xyz", challenge: "1", verifyToken: "abc" }).ok).toBe(false);
    expect(responderDesafio({ mode: "outro", token: "abc", challenge: "1", verifyToken: "abc" }).ok).toBe(false);
    expect(responderDesafio({ mode: "subscribe", token: "abc", challenge: null, verifyToken: "abc" }).ok).toBe(false);
    expect(responderDesafio({ mode: "subscribe", token: null, challenge: "1", verifyToken: "abc" }).ok).toBe(false);
  });

  it("token de tamanho diferente recusa sem explodir", () => {
    expect(() =>
      responderDesafio({ mode: "subscribe", token: "a", challenge: "1", verifyToken: "abcdef" })
    ).not.toThrow();
  });
});
