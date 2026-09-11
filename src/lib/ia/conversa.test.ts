import { describe, it, expect, afterEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { conversarComFerramentas, type ChamadaAoModelo } from "./conversa";
import { FERRAMENTAS, AVISO_DE_PROPOSTA, type ExecutorDeFerramenta } from "./ferramentas";
import { MAX_RODADAS, CERCA_DO_RESULTADO } from "./laco";
import type { AgenteDef } from "./catalogo";

function agente(ferramentas: string[] = [], over: Partial<AgenteDef> = {}): AgenteDef {
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
    ...over,
  };
}

function registrarLeitura(nome: string, executar: ExecutorDeFerramenta) {
  FERRAMENTAS[nome] = {
    def: { nome, descricao: "leitura de teste", parametros: { type: "object" }, natureza: "leitura" },
    executar,
  };
}

function registrarEscrita(nome: string) {
  FERRAMENTAS[nome] = {
    def: { nome, descricao: "escrita de teste", parametros: { type: "object" }, natureza: "escrita" },
  };
}

/** Uma resposta do provedor, no formato de blocos. */
function resposta(
  blocos: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown })[],
  uso: { entrada: number; saida: number } | null = { entrada: 100, saida: 20 }
): Anthropic.Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: blocos as unknown as Anthropic.ContentBlock[],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: uso ? { input_tokens: uso.entrada, output_tokens: uso.saida } : undefined,
  } as unknown as Anthropic.Message;
}

/** Encadeia respostas fixas, uma por rodada. */
function roteiro(...respostas: Anthropic.Message[]): ChamadaAoModelo {
  let i = 0;
  return async () => respostas[Math.min(i++, respostas.length - 1)]!;
}

function rodar(def: AgenteDef, chamarModelo: ChamadaAoModelo) {
  return conversarComFerramentas({
    apiKey: "sk-teste",
    model: "claude-sonnet-5",
    def,
    system: "sistema",
    pergunta: "pergunta",
    ctx: { tenantId: "t1", userId: "u1", escopo: { vagaId: "v1" } },
    chamarModelo,
  });
}

afterEach(() => {
  for (const k of Object.keys(FERRAMENTAS)) delete FERRAMENTAS[k];
  vi.restoreAllMocks();
});

describe("conversa sem ferramenta", () => {
  it("uma rodada, texto direto", async () => {
    const r = await rodar(agente(), roteiro(resposta([{ type: "text", text: "pronto" }])));
    expect(r.valor).toBe("pronto");
    expect(r.rodadas).toBe(1);
    expect(r.truncado).toBe(false);
    expect(r.propostas).toEqual([]);
    expect(r.uso).toEqual({ entrada: 100, saida: 20 });
  });
});

describe("conversa com ferramenta de leitura", () => {
  it("executa, devolve e conclui na rodada seguinte", async () => {
    const executar = vi.fn(async () => ({ nome: "ACME", situacao: "ativa" }));
    registrarLeitura("ler_empresa", executar);

    const r = await rodar(
      agente(["ler_empresa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: { cnpj: "1" } }]),
        resposta([{ type: "text", text: "a ACME está ativa" }])
      )
    );

    expect(executar).toHaveBeenCalledOnce();
    expect(r.valor).toBe("a ACME está ativa");
    expect(r.rodadas).toBe(2);
    // Soma das duas rodadas, não a última — é o que faz o teto contar certo.
    expect(r.uso).toEqual({ entrada: 200, saida: 40 });
  });

  // `tenantId` não é parâmetro do modelo: se fosse, bastaria ele inventar outro
  // — ou ser convencido a inventar — para vazar dado entre clientes.
  it("a ferramenta recebe o tenant do contexto, não do modelo", async () => {
    const executar = vi.fn<ExecutorDeFerramenta>(async () => "ok");
    registrarLeitura("ler_empresa", executar);

    await rodar(
      agente(["ler_empresa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: { tenantId: "OUTRO" } }]),
        resposta([{ type: "text", text: "fim" }])
      )
    );

    expect(executar.mock.calls[0]![1]).toEqual({
      tenantId: "t1",
      userId: "u1",
      escopo: { vagaId: "v1" },
    });
  });

  it("ferramenta que explode não derruba a conversa", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    registrarLeitura("ler_empresa", async () => {
      throw new Error("banco fora do ar");
    });

    const r = await rodar(
      agente(["ler_empresa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }]),
        resposta([{ type: "text", text: "não consegui consultar" }])
      )
    );
    expect(r.valor).toBe("não consegui consultar");
  });

  it("o resultado volta ao modelo dentro da cerca", async () => {
    registrarLeitura("ler_empresa", async () => ({ nome: "ACME" }));
    const vistos: Anthropic.MessageParam[][] = [];
    let i = 0;
    const respostas = [
      resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }]),
      resposta([{ type: "text", text: "fim" }]),
    ];

    await rodar(agente(["ler_empresa"]), async (messages) => {
      vistos.push(JSON.parse(JSON.stringify(messages)));
      return respostas[Math.min(i++, 1)]!;
    });

    const segundaIda = JSON.stringify(vistos[1]);
    expect(segundaIda).toContain(CERCA_DO_RESULTADO);
    expect(segundaIda).toContain("ACME");
  });
});

describe("a fronteira da escrita", () => {
  // O ponto inteiro da Onda 2: não existe caminho para o agente gravar.
  it("ferramenta de escrita NÃO executa — vira proposta", async () => {
    registrarEscrita("criar_tarefa");

    const r = await rodar(
      agente(["criar_tarefa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "criar_tarefa", input: { titulo: "ligar" } }]),
        resposta([{ type: "text", text: "sugeri uma tarefa" }])
      )
    );

    expect(r.propostas).toEqual([
      { ferramenta: "criar_tarefa", descricao: "escrita de teste", argumentos: { titulo: "ligar" } },
    ]);
  });

  // Um modelo que acredita ter gravado escreve o final como se estivesse
  // resolvido, ao lado de um botão de confirmar que ninguém apertou.
  it("o modelo é avisado de que nada foi gravado", async () => {
    registrarEscrita("criar_tarefa");
    const vistos: string[] = [];
    let i = 0;
    const respostas = [
      resposta([{ type: "tool_use", id: "t1", name: "criar_tarefa", input: {} }]),
      resposta([{ type: "text", text: "fim" }]),
    ];

    await rodar(agente(["criar_tarefa"]), async (messages) => {
      vistos.push(JSON.stringify(messages));
      return respostas[Math.min(i++, 1)]!;
    });

    expect(vistos[1]).toContain(AVISO_DE_PROPOSTA);
  });

  // O caso que a ausência de executor esconderia: uma ferramenta de escrita
  // registrada COM executor, por engano ou por conveniência de quem a
  // escreveu. Quem barra tem de ser a natureza declarada, não o acaso de
  // faltar função — senão a fronteira depende de ninguém errar.
  it("escrita com executor registrado por engano ainda não executa", async () => {
    const executar = vi.fn(async () => "gravei");
    FERRAMENTAS["criar_tarefa"] = {
      def: {
        nome: "criar_tarefa",
        descricao: "escrita de teste",
        parametros: { type: "object" },
        natureza: "escrita",
      },
      executar,
    };

    const r = await rodar(
      agente(["criar_tarefa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "criar_tarefa", input: { titulo: "x" } }]),
        resposta([{ type: "text", text: "fim" }])
      )
    );

    expect(executar).not.toHaveBeenCalled();
    expect(r.propostas).toHaveLength(1);
  });

  // Mesmo um agente marcado como `escreve` no catálogo não grava pelo laço:
  // a fronteira é estrutural, não uma flag.
  it("agente marcado como escritor também só propõe", async () => {
    registrarEscrita("criar_tarefa");
    const r = await rodar(
      agente(["criar_tarefa"], { escreve: true }),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "criar_tarefa", input: {} }]),
        resposta([{ type: "text", text: "fim" }])
      )
    );
    expect(r.propostas).toHaveLength(1);
  });
});

describe("a allowlist no laço", () => {
  it("ferramenta de outro agente é recusada e nunca executa", async () => {
    const executar = vi.fn(async () => "segredo da folha");
    registrarLeitura("ler_folha", executar);

    const r = await rodar(
      agente([]), // não declara nenhuma
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "ler_folha", input: {} }]),
        resposta([{ type: "text", text: "não pude consultar" }])
      )
    );

    expect(executar).not.toHaveBeenCalled();
    expect(r.valor).toBe("não pude consultar");
  });

  it("a recusa volta como erro de ferramenta, sem exceção", async () => {
    registrarLeitura("ler_folha", async () => "x");
    const vistos: string[] = [];
    let i = 0;
    const respostas = [
      resposta([{ type: "tool_use", id: "t1", name: "ler_folha", input: {} }]),
      resposta([{ type: "text", text: "fim" }]),
    ];

    await rodar(agente([]), async (messages) => {
      vistos.push(JSON.stringify(messages));
      return respostas[Math.min(i++, 1)]!;
    });

    expect(vistos[1]).toContain("não está liberada");
    expect(vistos[1]).toContain('"is_error":true');
  });
});

describe("limites", () => {
  // O buraco que a Onda 2 tapa: o teto de `podeChamar` roda uma vez, antes. Um
  // modelo em ciclo gastaria o mês dentro de uma execução só.
  it("modelo em ciclo para no limite de rodadas", async () => {
    registrarLeitura("ler_empresa", async () => "de novo");
    const r = await rodar(
      agente(["ler_empresa"]),
      // Sempre pede ferramenta, nunca conclui.
      roteiro(resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }]))
    );

    expect(r.rodadas).toBe(MAX_RODADAS);
    expect(r.truncado).toBe(true);
  });

  // Ao truncar não há mais uma ida: essa rodada carrega o histórico inteiro e
  // é a mais cara de todas. Um teto que gasta mais ao ser atingido não é teto.
  it("truncar não gasta uma rodada extra", async () => {
    registrarLeitura("ler_empresa", async () => "x");
    const chamar = vi.fn<ChamadaAoModelo>(async () =>
      resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }])
    );
    await rodar(agente(["ler_empresa"]), chamar);
    expect(chamar).toHaveBeenCalledTimes(MAX_RODADAS);
  });

  it("truncado sem texto nenhum devolve o aviso, não vazio", async () => {
    registrarLeitura("ler_empresa", async () => "x");
    const r = await rodar(
      agente(["ler_empresa"]),
      roteiro(resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }]))
    );
    expect(r.valor).toContain("incompleta");
  });

  it("uma rodada sem contagem contamina o uso da execução", async () => {
    registrarLeitura("ler_empresa", async () => "x");
    const r = await rodar(
      agente(["ler_empresa"]),
      roteiro(
        resposta([{ type: "tool_use", id: "t1", name: "ler_empresa", input: {} }], null),
        resposta([{ type: "text", text: "fim" }])
      )
    );
    expect(r.uso).toBeNull();
  });
});
