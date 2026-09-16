import { afterEach, describe, expect, it, vi } from "vitest";
import { provedorEvolucao, idDaMensagem, CABECALHO_DO_SEGREDO, lerEstadoDaEvolution } from "./evolucao";

// Formato conferido no código do tag 2.3.7 da Evolution API
// (`webhook.controller.ts` e `prepareMessage` em `whatsapp.baileys.service.ts`).

type Dados = Record<string, unknown>;

function upsert(data: Dados | Dados[], evento = "messages.upsert") {
  return {
    event: evento,
    instance: "recrut",
    destination: "https://connect.test/api/integrations/whatsapp/webhook/x",
    date_time: "2026-09-14T10:00:00.000Z",
    sender: "554199990000@s.whatsapp.net",
    server_url: "https://evo.test",
    apikey: null,
    data,
  };
}

function texto(over: Dados = {}, chave: Dados = {}): Dados {
  return {
    key: { remoteJid: "5541988887777@s.whatsapp.net", fromMe: false, id: "3EB0AAA", participant: null, ...chave },
    pushName: "Ana",
    status: "DELIVERY_ACK",
    message: { conversation: "oi, tudo bem?" },
    messageType: "conversation",
    messageTimestamp: 1789000000,
    instanceId: "uuid",
    source: "android",
    ...over,
  };
}

const REQ = (cabecalhos: Record<string, string> = {}) => ({
  corpoBruto: "{}",
  cabecalhos: new Headers(cabecalhos),
  url: new URL("https://connect.test/x"),
});

describe("Evolution · lerEvento", () => {
  it("lê uma mensagem de texto inteira, com id prefixado pela instância", () => {
    const { mensagens, ignoradas, somenteStatus } = provedorEvolucao.lerEvento(upsert(texto()));
    expect(somenteStatus).toBe(false);
    expect(ignoradas).toEqual([]);
    expect(mensagens).toEqual([
      {
        waMessageId: "evo:recrut:3EB0AAA",
        de: "5541988887777",
        texto: "oi, tudo bem?",
        recebidaEm: new Date(1789000000 * 1000),
        nomeDoPerfil: "Ana",
      },
    ]);
  });

  it("aceita o texto em extendedTextMessage, caso a conversão mude de versão", () => {
    const { mensagens } = provedorEvolucao.lerEvento(
      upsert(texto({ messageType: "extendedTextMessage", message: { extendedTextMessage: { text: "olá" } } }))
    );
    expect(mensagens.map((m) => m.texto)).toEqual(["olá"]);
  });

  // O próprio número digitando no celular. Responder seria o robô falando
  // sozinho — e ele não pode nem virar "ignorada", que transferiria para gente.
  it("mensagem do próprio número é descartada, sem virar ignorada", () => {
    const r = provedorEvolucao.lerEvento(upsert(texto({}, { fromMe: true })));
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradas).toEqual([]);
  });

  it("grupo, status e canal são descartados", () => {
    for (const remoteJid of ["120363000000@g.us", "status@broadcast", "120363000000@newsletter"]) {
      const r = provedorEvolucao.lerEvento(upsert(texto({}, { remoteJid })));
      expect(r.mensagens, remoteJid).toEqual([]);
      expect(r.ignoradas, remoteJid).toEqual([]);
    }
  });

  // Responder a um áudio com um robô que não o ouviu é pior que não responder.
  it("imagem, áudio e documento viram ignorada, para uma pessoa assumir", () => {
    const r = provedorEvolucao.lerEvento(
      upsert([
        texto({ messageType: "imageMessage", message: { imageMessage: {} } }, { id: "A" }),
        texto({ messageType: "audioMessage", message: { audioMessage: {} } }, { id: "B" }),
      ])
    );
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradas.map((i) => i.tipo)).toEqual(["imageMessage", "audioMessage"]);
  });

  it("reação não é pergunta de ninguém: nem mensagem, nem ignorada", () => {
    const r = provedorEvolucao.lerEvento(upsert(texto({ messageType: "reactionMessage", message: {} })));
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradas).toEqual([]);
  });

  // Sem número não dá para responder — e sumir com a mensagem deixaria o
  // candidato sem resposta sem ninguém saber.
  it("contato @lid sem número vai para uma pessoa", () => {
    const r = provedorEvolucao.lerEvento(upsert(texto({}, { remoteJid: "123456789012345@lid" })));
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradas).toHaveLength(1);
    expect(r.ignoradas[0]!.tipo).toContain("@lid");
  });

  it("texto vazio vira ignorada, não string vazia", () => {
    const r = provedorEvolucao.lerEvento(upsert(texto({ message: { conversation: "" } })));
    expect(r.mensagens).toEqual([]);
    expect(r.ignoradas.map((i) => i.tipo)).toEqual(["texto vazio"]);
  });

  it("outros eventos saem como status", () => {
    for (const evento of ["messages.update", "connection.update", "qrcode.updated"]) {
      expect(provedorEvolucao.lerEvento(upsert({ keyId: "x" }, evento)).somenteStatus, evento).toBe(true);
    }
  });

  it("aceita o nome do evento como aparece na configuração (MESSAGES_UPSERT)", () => {
    expect(provedorEvolucao.lerEvento(upsert(texto(), "MESSAGES_UPSERT")).mensagens).toHaveLength(1);
  });

  it("timestamp inválido não vira Invalid Date", () => {
    const { mensagens } = provedorEvolucao.lerEvento(upsert(texto({ messageTimestamp: "vixe" })));
    expect(mensagens[0]!.recebidaEm.getTime()).not.toBeNaN();
  });

  it("lixo, nulo e formato inesperado não lançam", () => {
    for (const v of [null, undefined, 42, "texto", {}, { event: "messages.upsert", data: "x" }, []]) {
      expect(() => provedorEvolucao.lerEvento(v)).not.toThrow();
      expect(provedorEvolucao.lerEvento(v).mensagens).toEqual([]);
    }
  });

  it("a mesma mensagem por duas instâncias não colide na chave única", () => {
    expect(idDaMensagem("numero-a", "3EB0")).not.toBe(idDaMensagem("numero-b", "3EB0"));
  });
});

describe("Evolution · autenticar", () => {
  const CONFIG = { webhookSecret: "segredo-escolhido" };

  it("o cabeçalho secreto certo passa", () => {
    expect(provedorEvolucao.autenticar(REQ({ [CABECALHO_DO_SEGREDO]: "segredo-escolhido" }), CONFIG)).toEqual({ ok: true });
  });

  it("sem cabeçalho, ou com outro valor, recusa", () => {
    expect(provedorEvolucao.autenticar(REQ(), CONFIG).ok).toBe(false);
    expect(provedorEvolucao.autenticar(REQ({ [CABECALHO_DO_SEGREDO]: "segredo-errado!!" }), CONFIG).ok).toBe(false);
  });

  // Rota pública: conexão sem segredo aceitando tudo seria qualquer um
  // inventando mensagem de candidato.
  it("conexão sem segredo configurado recusa tudo", () => {
    expect(provedorEvolucao.autenticar(REQ({ [CABECALHO_DO_SEGREDO]: "" }), {}).ok).toBe(false);
    expect(provedorEvolucao.autenticar(REQ({ [CABECALHO_DO_SEGREDO]: "x" }), { webhookSecret: "" }).ok).toBe(false);
  });

  it("valor de tamanho diferente recusa sem explodir", () => {
    expect(() => provedorEvolucao.autenticar(REQ({ [CABECALHO_DO_SEGREDO]: "a" }), CONFIG)).not.toThrow();
  });
});

describe("Evolution · enviarTexto", () => {
  afterEach(() => vi.unstubAllGlobals());

  const CONFIG = { baseUrl: "https://evo.test/", instance: "recrut", apiKey: "chave" };

  it("manda para a instância, com a apikey e o corpo da v2, e devolve o id prefixado", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ key: { id: "3EB0BBB", fromMe: true } }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchFalso);

    const r = await provedorEvolucao.enviarTexto(CONFIG, "5541988887777", "Olá!");

    expect(r).toEqual({ ok: true, waMessageId: "evo:recrut:3EB0BBB" });
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://evo.test/message/sendText/recrut");
    expect(init.headers).toMatchObject({ apikey: "chave" });
    expect(JSON.parse(init.body)).toEqual({ number: "5541988887777", text: "Olá!", linkPreview: false });
  });

  it("erro da Evolution volta com o status e o corpo, sem lançar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"status":400,"response":{"message":[{"exists":false}]}}', { status: 400 }))
    );
    const r = await provedorEvolucao.enviarTexto(CONFIG, "5541900000000", "Olá!");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("400");
  });

  it("conexão incompleta nem chama a Evolution", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await provedorEvolucao.enviarTexto({ baseUrl: "https://evo.test" }, "5541988887777", "Olá!");
    expect(r.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("Evolution · estado da conexão", () => {
  afterEach(() => vi.unstubAllGlobals());

  const CONFIG = { baseUrl: "https://evo.test/", instance: "Teste Connect", apiKey: "chave" };

  it("lê os três estados do Baileys", () => {
    expect(lerEstadoDaEvolution({ instance: { instanceName: "x", state: "open" } }).estado).toBe("conectado");
    expect(lerEstadoDaEvolution({ instance: { instanceName: "x", state: "connecting" } }).estado).toBe("conectando");
    expect(lerEstadoDaEvolution({ instance: { instanceName: "x", state: "close" } }).estado).toBe("desconectado");
  });

  // Instância existe mas não está carregada: para quem atende, é número caído.
  it("estado ausente ou desconhecido conta como desconectado, com o motivo", () => {
    const r = lerEstadoDaEvolution({ instance: { instanceName: "x" } });
    expect(r.estado).toBe("desconectado");
    expect(r.detalhe).not.toBeNull();
    expect(lerEstadoDaEvolution(null).estado).toBe("desconectado");
  });

  it("consulta a instância com espaço no nome e a apikey no header", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ instance: { instanceName: "Teste Connect", state: "open" } })));
    vi.stubGlobal("fetch", fetchFalso);

    const r = await provedorEvolucao.consultarConexao!(CONFIG);

    expect(r).toEqual({ estado: "conectado", detalhe: null });
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://evo.test/instance/connectionState/Teste%20Connect");
    expect(init.headers).toMatchObject({ apikey: "chave" });
  });

  it("erro HTTP vira indisponível com o corpo, sem lançar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"status":404,"response":{"message":["does not exist"]}}', { status: 404 }))
    );
    const r = await provedorEvolucao.consultarConexao!(CONFIG);
    expect(r.estado).toBe("indisponivel");
    expect(r.detalhe).toContain("404");
  });

  it("falha de rede vira indisponível, sem lançar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const r = await provedorEvolucao.consultarConexao!(CONFIG);
    expect(r).toEqual({ estado: "indisponivel", detalhe: "ECONNREFUSED" });
  });

  it("conexão incompleta nem chama a Evolution", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const r = await provedorEvolucao.consultarConexao!({ baseUrl: "https://evo.test" });
    expect(r.estado).toBe("indisponivel");
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("Evolution · documento recebido", () => {
  afterEach(() => vi.unstubAllGlobals());

  const CONFIG = { baseUrl: "https://evo.test", instance: "Teste Connect", apiKey: "chave" };

  it("documento vira ignorada com nome, mimetype, tamanho e a mensagem inteira para baixar", () => {
    const mensagem = {
      documentMessage: { fileName: "cv.pdf", mimetype: "application/pdf", fileLength: { low: 250000, high: 0 } },
    };
    const ev = provedorEvolucao.lerEvento(upsert(texto({ messageType: "documentMessage", message: mensagem })));
    expect(ev.mensagens).toHaveLength(0);
    const doc = ev.ignoradas[0]!.documento!;
    expect(doc).toMatchObject({ nomeDoArquivo: "cv.pdf", mimetype: "application/pdf", tamanhoBytes: 250000 });
    expect(doc.referencia).toMatchObject({ key: { id: "3EB0AAA" }, message: mensagem });
  });

  it("documento com legenda também é lido", () => {
    const mensagem = {
      documentWithCaptionMessage: { message: { documentMessage: { fileName: "cv.pdf", mimetype: "application/pdf", fileLength: "1024" } } },
    };
    const ev = provedorEvolucao.lerEvento(upsert(texto({ messageType: "documentWithCaptionMessage", message: mensagem })));
    expect(ev.ignoradas[0]!.documento).toMatchObject({ nomeDoArquivo: "cv.pdf", tamanhoBytes: 1024 });
  });

  it("áudio não traz documento", () => {
    const ev = provedorEvolucao.lerEvento(upsert(texto({ messageType: "audioMessage", message: { audioMessage: {} } })));
    expect(ev.ignoradas[0]!.documento).toBeUndefined();
  });

  it("baixa pela rota da 2.3.7 e devolve os bytes", async () => {
    const fetchFalso = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ mediaType: "documentMessage", fileName: "cv.pdf", mimetype: "application/pdf", base64: Buffer.from("%PDF-1.7").toString("base64") }),
        { status: 201 }
      )
    );
    vi.stubGlobal("fetch", fetchFalso);

    const r = await provedorEvolucao.baixarMidia!(CONFIG, { key: { id: "X" }, message: { documentMessage: {} } });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bytes.toString()).toBe("%PDF-1.7");
    const [url, init] = fetchFalso.mock.calls[0]!;
    expect(url).toBe("https://evo.test/chat/getBase64FromMediaMessage/Teste%20Connect");
    expect(JSON.parse(init.body)).toEqual({ message: { key: { id: "X" }, message: { documentMessage: {} } }, convertToMp4: false });
  });

  it("erro ou resposta sem arquivo não lança", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"status":400,"response":{"message":["x"]}}', { status: 400 })));
    expect((await provedorEvolucao.baixarMidia!(CONFIG, {})).ok).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));
    expect((await provedorEvolucao.baixarMidia!(CONFIG, {})).ok).toBe(false);
  });
});
