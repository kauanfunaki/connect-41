import { describe, it, expect, afterEach, vi } from "vitest";
import {
  conversarComFerramentasOpenAi,
  schemaParaStrict,
  ferramentaOpenAi,
  ehModeloDeRaciocinio,
  URL_DA_RESPONSES_API,
} from "./conversa-openai";
import { FERRAMENTAS, AVISO_DE_PROPOSTA, type ExecutorDeFerramenta } from "./ferramentas";
import { MAX_RODADAS, CERCA_DO_RESULTADO } from "./laco";
import type { AgenteDef } from "./catalogo";

function agente(ferramentas: string[] = []): AgenteDef {
  return {
    code: "teste",
    label: "Teste",
    sectorCode: null,
    description: "",
    faixa: "padrao",
    escreve: false,
    ferramentas,
    tetoMensalCentavos: 1_000,
    tetoMensalChamadas: 100,
    padraoLigado: false,
  };
}

const SCHEMA_STRICT = {
  type: "object",
  properties: { cnpj: { type: "string" } },
  required: ["cnpj"],
  additionalProperties: false,
};

function registrarLeitura(nome: string, executar: ExecutorDeFerramenta, parametros: Record<string, unknown> = SCHEMA_STRICT) {
  FERRAMENTAS[nome] = { def: { nome, descricao: "leitura de teste", parametros, natureza: "leitura" }, executar };
}

function registrarEscrita(nome: string) {
  FERRAMENTAS[nome] = { def: { nome, descricao: "escrita de teste", parametros: SCHEMA_STRICT, natureza: "escrita" } };
}

type Uso = { input_tokens: number; output_tokens: number } | null;

function texto(t: string, usage: Uso = { input_tokens: 100, output_tokens: 20 }) {
  return {
    status: "completed",
    output: [{ type: "message", id: "msg_1", role: "assistant", content: [{ type: "output_text", text: t }] }],
    usage: usage ? { ...usage, input_tokens_details: { cached_tokens: 0 } } : undefined,
  };
}

function chamada(nome: string, args: string, callId = "call_1", usage: Uso = { input_tokens: 100, output_tokens: 20 }) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "cifrado" },
      { type: "function_call", id: "fc_1", call_id: callId, name: nome, arguments: args, status: "completed" },
    ],
    usage: usage ?? undefined,
  };
}

/** Mocka `fetch` com respostas fixas, uma por rodada (a última se repete). */
function roteiro(...corpos: unknown[]) {
  let i = 0;
  const mock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const corpo = corpos[Math.min(i++, corpos.length - 1)];
    return new Response(JSON.stringify(corpo), { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

function corpoDa(mock: ReturnType<typeof roteiro>, n: number) {
  return JSON.parse(mock.mock.calls[n]![1]!.body as string);
}

function rodar(def: AgenteDef, model = "gpt-5.6-terra") {
  return conversarComFerramentasOpenAi({
    apiKey: "sk-teste",
    model,
    def,
    system: "sistema",
    pergunta: "pergunta",
    maxTokens: 800,
    ctx: { tenantId: "t1", userId: null, escopo: { threadId: "th1" } },
  });
}

afterEach(() => {
  for (const k of Object.keys(FERRAMENTAS)) delete FERRAMENTAS[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI: conversa sem ferramenta", () => {
  it("uma rodada, texto direto, sem guardar nada na OpenAI", async () => {
    const f = roteiro(texto("pronto"));
    const r = await rodar(agente());

    expect(r).toMatchObject({ valor: "pronto", rodadas: 1, truncado: false, propostas: [] });
    expect(r.uso).toEqual({ entrada: 100, saida: 20 });

    expect(f.mock.calls[0]![0]).toBe(URL_DA_RESPONSES_API);
    const corpo = corpoDa(f, 0);
    expect(corpo.store).toBe(false);
    expect(corpo.instructions).toBe("sistema");
    expect(corpo.model).toBe("gpt-5.6-terra");
    expect(corpo.tools).toBeUndefined();
    expect(corpo.previous_response_id).toBeUndefined();
  });
});

describe("OpenAI: ferramenta de leitura", () => {
  it("executa, devolve pelo call_id dentro da cerca e conclui somando o uso", async () => {
    const executar = vi.fn<ExecutorDeFerramenta>(async () => ({ nome: "ACME", situacao: "ativa" }));
    registrarLeitura("ler_empresa", executar);
    const f = roteiro(chamada("ler_empresa", '{"cnpj":"1"}', "call_42"), texto("a ACME está ativa"));

    const r = await rodar(agente(["ler_empresa"]));

    expect(executar).toHaveBeenCalledOnce();
    expect(executar.mock.calls[0]![0]).toEqual({ cnpj: "1" });
    // O tenant vem do contexto, nunca do modelo.
    expect(executar.mock.calls[0]![1]).toEqual({ tenantId: "t1", userId: null, escopo: { threadId: "th1" } });
    expect(r.valor).toBe("a ACME está ativa");
    expect(r.rodadas).toBe(2);
    expect(r.uso).toEqual({ entrada: 200, saida: 40 });

    const primeiro = corpoDa(f, 0);
    expect(primeiro.tools).toEqual([
      { type: "function", name: "ler_empresa", description: "leitura de teste", parameters: SCHEMA_STRICT, strict: true },
    ]);
    expect(primeiro.include).toEqual(["reasoning.encrypted_content"]);

    const segundo = corpoDa(f, 1);
    // Histórico reenviado: pergunta, raciocínio, pedido e a saída pareada.
    expect(segundo.input.map((i: { type?: string }) => i.type)).toEqual([
      undefined,
      "reasoning",
      "function_call",
      "function_call_output",
    ]);
    const saida = segundo.input[3];
    expect(saida.call_id).toBe("call_42");
    expect(saida.output).toContain(CERCA_DO_RESULTADO);
    expect(saida.output).toContain("ACME");
  });

  it("argumento que não é JSON volta como erro e não executa", async () => {
    const executar = vi.fn<ExecutorDeFerramenta>(async () => "x");
    registrarLeitura("ler_empresa", executar);
    const f = roteiro(chamada("ler_empresa", "{quebrado"), texto("fim"));

    await rodar(agente(["ler_empresa"]));

    expect(executar).not.toHaveBeenCalled();
    expect(corpoDa(f, 1).input[3].output).toMatch(/^ERRO: .*JSON/);
  });

  it("ferramenta fora da allowlist é recusada como erro", async () => {
    const executar = vi.fn<ExecutorDeFerramenta>(async () => "segredo");
    registrarLeitura("ler_folha", executar);
    const f = roteiro(chamada("ler_folha", "{}"), texto("não pude"));

    const r = await rodar(agente([]));

    expect(executar).not.toHaveBeenCalled();
    expect(r.valor).toBe("não pude");
    expect(corpoDa(f, 1).input[3].output).toContain("não está liberada");
  });
});

describe("OpenAI: a fronteira da escrita", () => {
  it("ferramenta de escrita vira proposta, com os argumentos lidos da string", async () => {
    registrarEscrita("criar_tarefa");
    const f = roteiro(chamada("criar_tarefa", '{"cnpj":"9"}'), texto("sugeri"));

    const r = await rodar(agente(["criar_tarefa"]));

    expect(r.propostas).toEqual([
      { ferramenta: "criar_tarefa", descricao: "escrita de teste", argumentos: { cnpj: "9" } },
    ]);
    expect(corpoDa(f, 1).input[3].output).toBe(AVISO_DE_PROPOSTA);
  });
});

describe("OpenAI: limites e uso", () => {
  it("modelo em ciclo para no limite de rodadas, sem ida extra", async () => {
    registrarLeitura("ler_empresa", async () => "de novo");
    const f = roteiro(chamada("ler_empresa", '{"cnpj":"1"}'));

    const r = await rodar(agente(["ler_empresa"]));

    expect(f).toHaveBeenCalledTimes(MAX_RODADAS);
    expect(r.rodadas).toBe(MAX_RODADAS);
    expect(r.truncado).toBe(true);
    expect(r.valor).toContain("incompleta");
    expect(r.uso).toEqual({ entrada: 100 * MAX_RODADAS, saida: 20 * MAX_RODADAS });
  });

  it("uma rodada sem usage contamina o uso da execução", async () => {
    registrarLeitura("ler_empresa", async () => "x");
    roteiro(chamada("ler_empresa", "{}", "c", null), texto("fim"));
    const r = await rodar(agente(["ler_empresa"]));
    expect(r.uso).toBeNull();
  });

  it("erro HTTP propaga a mensagem da OpenAI, legível", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Incorrect API key provided", type: "invalid_request_error" } }), {
          status: 401,
        })
      )
    );
    await expect(rodar(agente())).rejects.toThrow("Falha ao consultar a OpenAI (HTTP 401): Incorrect API key provided");
  });

  it("resposta vazia por limite de tokens tenta de novo com limite maior e soma o uso", async () => {
    // Visto em 25/09 no atendente do WhatsApp: o raciocínio comeu o limite e
    // voltou sem texto nem ferramenta.
    const vazia = {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [{ type: "reasoning", summary: [] }],
      usage: { input_tokens: 100, output_tokens: 2848 },
    };
    const f = roteiro(vazia, texto("a descrição completa"));
    const r = await rodar(agente());

    expect(f).toHaveBeenCalledTimes(2);
    expect(corpoDa(f, 0).max_output_tokens).toBe(800 + 2048);
    expect(corpoDa(f, 1).max_output_tokens).toBe((800 + 2048) * 3);
    expect(r.valor).toBe("a descrição completa");
    expect(r.rodadas).toBe(1);
    expect(r.uso).toEqual({ entrada: 200, saida: 2868 });
  });

  it("incompleta com texto não repete: o texto já serve", async () => {
    const f = roteiro({ ...texto("meio texto"), status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
    await rodar(agente());
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("modelo legado não recebe include de raciocínio nem folga", async () => {
    const f = roteiro(texto("ok"));
    await rodar(agente(), "gpt-4.1");
    const corpo = corpoDa(f, 0);
    expect(corpo.include).toBeUndefined();
    expect(corpo.max_output_tokens).toBe(800);
  });
});

describe("schemaParaStrict", () => {
  it("aceita os schemas no formato das ferramentas atuais", () => {
    expect(schemaParaStrict(SCHEMA_STRICT)).toEqual(SCHEMA_STRICT);
    expect(
      schemaParaStrict({
        type: "object",
        properties: { etapa: { type: "string", enum: ["A", "B"] }, motivo: { type: "string", description: "x" } },
        required: ["etapa", "motivo"],
        additionalProperties: false,
      })
    ).not.toBeNull();
  });

  it("objeto sem propriedades ganha required vazio explícito", () => {
    expect(schemaParaStrict({ type: "object", properties: {}, additionalProperties: false })).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
      required: [],
    });
  });

  it("schema com campo opcional ou sem additionalProperties vai sem strict", () => {
    expect(schemaParaStrict({ type: "object" })).toBeNull();
    expect(
      schemaParaStrict({ type: "object", properties: { a: { type: "string" } }, additionalProperties: false })
    ).toBeNull();
    expect(
      ferramentaOpenAi({ nome: "x", descricao: "d", parametros: { type: "object" }, natureza: "leitura" }).strict
    ).toBe(false);
  });

  it("todas as ferramentas registradas de verdade aceitam strict", async () => {
    const { registrarTodasAsFerramentas } = await import("./registro");
    registrarTodasAsFerramentas();
    const recusadas = Object.values(FERRAMENTAS)
      .filter((reg) => schemaParaStrict(reg.def.parametros) === null)
      .map((reg) => reg.def.nome);
    expect(recusadas).toEqual([]);
  });
});

describe("ehModeloDeRaciocinio", () => {
  it("linha atual raciocina, gpt-4 legado não", () => {
    expect(ehModeloDeRaciocinio("gpt-5.6-terra")).toBe(true);
    expect(ehModeloDeRaciocinio("gpt-4.1-mini")).toBe(false);
  });
});
