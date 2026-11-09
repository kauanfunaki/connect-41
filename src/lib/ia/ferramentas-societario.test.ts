import { describe, it, expect } from "vitest";
import {
  FERRAMENTAS_DE_SOCIETARIO,
  hojeParaACeci,
  recorteDoProcesso,
  processoPedido,
  tipoPedido,
} from "./ferramentas-societario";
import { agenteDoCatalogo } from "./catalogo";
import type { ContextoDaFerramenta } from "./ferramentas";
import { schemaParaStrict } from "./conversa-openai";

const CTX: ContextoDaFerramenta = { tenantId: "t1", userId: "u1", escopo: {} };

const LEITURAS = ["listar_fila", "ver_processo", "tipos_de_processo", "roteiro_do_tipo", "responsaveis_do_societario"] as const;
const ESCRITAS = ["propor_abrir_processo", "propor_concluir_etapa", "propor_dispensar_etapa"] as const;

describe("o conjunto", () => {
  it("as de escrita não têm executor", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.executar).toBeUndefined();
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.def.natureza).toBe("escrita");
    }
  });

  it("as de leitura têm executor", () => {
    for (const nome of LEITURAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.executar).toBeDefined();
    }
  });

  it("o assistente do Societário libera exatamente estas", () => {
    // Cópia antes de ordenar: `.sort()` na lista do catálogo a reordenaria para
    // os outros testes. `encaminhar_pergunta` e `sugerir_respostas` são do chat
    // (orquestrador e respostas rápidas), não do Societário; as três do Tech
    // estão em toda Ceci da equipe (`ferramentas-tech.ts`).
    // `buscar_empresa` é a do Fiscal (`ferramentas-fiscal.ts`), no tenant —
    // a mesma do BPO e do DP; o Societário a usa para abrir processo (09/11/2026).
    const liberadas = [...agenteDoCatalogo("assistente_do_societario")!.ferramentas];
    const doChat = ["encaminhar_pergunta", "sugerir_respostas", "atividade_da_equipe", "sistemas_do_ops_center", "categorias_de_chamado", "propor_abrir_chamado"];
    const deOutroSetor = ["buscar_empresa"];
    expect(liberadas.sort()).toEqual([...Object.keys(FERRAMENTAS_DE_SOCIETARIO), ...doChat, ...deOutroSetor].sort());
  });

  it("as de escrita avisam, na descrição, que não executam", () => {
    for (const nome of ESCRITAS) {
      expect(FERRAMENTAS_DE_SOCIETARIO[nome]!.def.descricao).toMatch(/NÃO (conclui|dispensa|abre)/);
    }
  });

  // O modo estrito da OpenAI recusa schema com campo opcional — e derrubaria o
  // agente inteiro. Por isso todo campo da abertura vem sempre, vazio quando não há.
  it("todos os schemas aceitam o modo estrito", () => {
    for (const reg of Object.values(FERRAMENTAS_DE_SOCIETARIO)) {
      expect(schemaParaStrict(reg.def.parametros), reg.def.nome).not.toBeNull();
    }
  });

  // O modelo não escolhe o cliente. Nenhum schema aceita tenantId.
  it("nenhuma ferramenta aceita tenantId como parâmetro", () => {
    for (const reg of Object.values(FERRAMENTAS_DE_SOCIETARIO)) {
      const props = (reg.def.parametros as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain("tenantId");
    }
  });

  // A descrição é o que o modelo lê para decidir. Mandar consultar antes de
  // sugerir é o que evita proposta sobre etapa de órgão ou com item pendente —
  // as duas que a server action recusaria depois, com o usuário já clicando.
  it("a descrição de concluir diz quando NÃO sugerir", () => {
    const d = FERRAMENTAS_DE_SOCIETARIO.propor_concluir_etapa!.def.descricao;
    expect(d).toMatch(/liberada/i);
    expect(d).toMatch(/obrigatório/i);
  });
});

describe("o recorte do processo", () => {
  it("é por id E tenant", () => {
    expect(recorteDoProcesso({ processoId: "p1" }, CTX)).toEqual({ id: "p1", tenantId: "t1" });
  });

  it("o id vem aparado, e o tenant não vem do modelo", () => {
    expect(recorteDoProcesso({ processoId: "  p1 ", tenantId: "OUTRO" }, CTX)).toEqual({
      id: "p1",
      tenantId: "t1",
    });
  });

  it("id ausente ou que não é texto recusa antes do banco", () => {
    expect(() => processoPedido({})).toThrow(/processoId/);
    expect(() => processoPedido({ processoId: "  " })).toThrow(/processoId/);
    expect(() => processoPedido({ processoId: 7 })).toThrow(/processoId/);
  });

  it("ver_processo recusa sem id, sem consultar", async () => {
    await expect(FERRAMENTAS_DE_SOCIETARIO.ver_processo!.executar!({}, CTX)).rejects.toThrow(
      /processoId/
    );
  });
});

describe("abrir processo pela Ceci", () => {
  const abrir = FERRAMENTAS_DE_SOCIETARIO.propor_abrir_processo!;

  it("é escrita sem executor, com a conferência de antes da proposta", () => {
    expect(abrir.def.natureza).toBe("escrita");
    expect(abrir.executar).toBeUndefined();
    expect(abrir.preparar).toBeDefined();
  });

  // A descrição manda consultar antes: os ids saem das ferramentas, nunca de
  // suposição — é o que evita processo aberto na empresa ou no tipo errado.
  it("a descrição manda consultar tipo, empresa, responsável e roteiro antes", () => {
    const d = abrir.def.descricao;
    for (const nome of ["tipos_de_processo", "buscar_empresa", "responsaveis_do_societario", "roteiro_do_tipo"]) {
      expect(d).toContain(nome);
    }
  });

  it("todo argumento é obrigatório no schema (vazio quando não há)", () => {
    const p = abrir.def.parametros as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(p.properties).sort()).toEqual([...p.required].sort());
    expect(p.required).toEqual(
      expect.arrayContaining(["tipoId", "empresaId", "responsavelId", "titulo", "prioridade", "prazo", "jaTemos", "pedidoAoCliente"])
    );
  });

  // Argumento torto volta ao modelo antes de qualquer consulta ao banco.
  it("a conferência recusa argumento torto antes do banco", async () => {
    const r = await abrir.preparar!({ tipoId: "t", prioridade: "NORMAL" }, CTX);
    expect(r).toEqual({ erro: expect.stringMatching(/empresa/i) });
  });

  it("roteiro_do_tipo recusa sem tipo, sem consultar", async () => {
    await expect(FERRAMENTAS_DE_SOCIETARIO.roteiro_do_tipo!.executar!({}, CTX)).rejects.toThrow(/tipoId/);
    expect(() => tipoPedido({ tipoId: "  " })).toThrow(/tipoId/);
    expect(tipoPedido({ tipoId: " t1 " })).toBe("t1");
  });

  // O modelo não sabe que dia é: sem isto, "prazo dia 20" vira data inventada.
  it("a data de hoje vai em São Paulo, com o dia da semana", () => {
    // 01h UTC de 10/11 ainda é 09/11 em São Paulo.
    expect(hojeParaACeci(new Date("2026-11-10T01:00:00Z"))).toEqual({ data: "2026-11-09", legivel: "segunda-feira, 09/11/2026" });
  });
});
