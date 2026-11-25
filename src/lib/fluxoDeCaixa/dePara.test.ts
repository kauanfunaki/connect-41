import { describe, expect, it } from "vitest";
import { LINHAS_DO_FLUXO, linhaDeTexto } from "./estrutura";
import { sugerirLinha } from "./sugestao";
import { lerDePara, planejarDePara, resumoDoPlano, type CategoriaDoPlano } from "./dePara";

describe("linhaDeTexto", () => {
  it("aceita o código e o rótulo, sem caixa e sem acento", () => {
    expect(linhaDeTexto("pessoal")).toBe("pessoal");
    expect(linhaDeTexto("DESPESAS COM PESSOAL")).toBe("pessoal");
    expect(linhaDeTexto("Impostos e Contribuicoes")).toBe("impostos");
  });

  it("aceita os subgrupos de DFC que os clientes escrevem", () => {
    expect(linhaDeTexto("Recebimentos de Clientes (Faturado)")).toBe("recebimentos");
    expect(linhaDeTexto("Matéria-Prima")).toBe("materia_prima");
    expect(linhaDeTexto("Investimentos (Máquinas, Obras e Aplicações)")).toBe("investimentos");
    expect(linhaDeTexto("Captações (Empréstimos)")).toBe("captacoes");
    expect(linhaDeTexto("Aportes/Retiradas de Capital")).toBe("socios");
    expect(linhaDeTexto("Excluir (Transferência Interna)")).toBe("fora");
  });

  it("não chuta o que não reconhece", () => {
    expect(linhaDeTexto("Galvanização")).toBeNull();
    expect(linhaDeTexto("")).toBeNull();
  });

  it("todo código de linha é único", () => {
    expect(new Set(LINHAS_DO_FLUXO.map((l) => l.code)).size).toBe(LINHAS_DO_FLUXO.length);
  });
});

describe("sugerirLinha", () => {
  it("separa pelo começo da palavra (ISS é imposto, comissão não)", () => {
    expect(sugerirLinha("ISS retido", "PAGAR")).toBe("impostos");
    expect(sugerirLinha("Comissões de produção", "PAGAR")).toBe("comissoes");
  });

  it("empréstimo é captação quando entra e amortização quando sai", () => {
    expect(sugerirLinha("Empréstimo bancário", "RECEBER")).toBe("captacoes");
    expect(sugerirLinha("Empréstimo bancário", "PAGAR")).toBe("amortizacoes");
  });

  it("juros e transferência ganham das palavras operacionais do mesmo nome", () => {
    expect(sugerirLinha("Juros sobre folha", "PAGAR")).toBe("juros");
    expect(sugerirLinha("Transferência entre contas", "RECEBER")).toBe("fora");
  });

  it("sem palavra conhecida, cai em outras do lado certo", () => {
    expect(sugerirLinha("Diversos", "PAGAR")).toBe("outras_saidas");
    expect(sugerirLinha("Diversos", "RECEBER")).toBe("outras_entradas");
    expect(sugerirLinha("Venda de produtos", "RECEBER")).toBe("recebimentos");
  });
});

describe("lerDePara", () => {
  it("acha as colunas pelo cabeçalho, mesmo com o Omie na segunda", () => {
    const r = lerDePara([
      ["Categoria Empresa X", "Categoria OMIE"],
      ["Folha", "Salários"],
      ["Folha", "FGTS"],
      [null, null],
    ]);
    expect(r).toEqual({
      ok: true,
      modo: "ligacoes",
      linhas: [
        { linha: 2, omie: "Salários", cliente: "Folha", linhaDoFluxo: null },
        { linha: 3, omie: "FGTS", cliente: "Folha", linhaDoFluxo: null },
      ],
    });
  });

  it("sem cabeçalho, vale A = Omie, B = cliente, C = linha", () => {
    const r = lerDePara([["Salários", "Folha", "Despesas com pessoal"]]);
    expect(r.ok && r.linhas[0]).toEqual({ linha: 1, omie: "Salários", cliente: "Folha", linhaDoFluxo: "Despesas com pessoal" });
  });

  it("a tabela do DFC (cliente → linha, sem Omie) vira o modo de linhas, com o subgrupo ganhando do grupo", () => {
    const r = lerDePara([
      ["Categoria Empresa X", "Grupo DFC", "Subgrupo DFC (linha do Fluxo)"],
      ["Folha", "Operacional", "Despesas com Pessoal"],
    ]);
    expect(r).toEqual({ ok: true, modo: "linhas", linhas: [{ linha: 2, omie: "", cliente: "Folha", linhaDoFluxo: "Despesas com Pessoal" }] });
  });

  it("lê a célula rica e a fórmula do exceljs", () => {
    const r = lerDePara([[{ richText: [{ text: "Salá" }, { text: "rios" }] }, { formula: "x", result: "Folha" } as never]]);
    expect(r.ok && r.linhas[0]?.omie).toBe("Salários");
    expect(r.ok && r.linhas[0]?.cliente).toBe("Folha");
  });

  it("planilha vazia diz que está vazia", () => {
    expect(lerDePara([[null], [""]])).toEqual({ ok: false, erro: "A planilha está vazia." });
  });
});

const plano: CategoriaDoPlano[] = [
  { id: "c1", name: "Salários", kind: "PAGAR", omieCode: "2.01.01", companyId: null },
  { id: "c2", name: "FGTS", kind: "PAGAR", omieCode: "2.01.02", companyId: "e1" },
  { id: "c3", name: "Juros", kind: "PAGAR", omieCode: null, companyId: null },
  { id: "c4", name: "Juros", kind: "RECEBER", omieCode: null, companyId: null },
  { id: "c5", name: "Venda de produtos", kind: "RECEBER", omieCode: "1.01.01", companyId: null },
];

describe("planejarDePara", () => {
  it("casa pelo código do Omie ou pelo nome, e um nome dos dois lados liga os dois", () => {
    const p = planejarDePara(
      [
        { linha: 2, omie: "2.01.01", cliente: "Folha", linhaDoFluxo: null },
        { linha: 3, omie: "fgts", cliente: "Folha", linhaDoFluxo: null },
        { linha: 4, omie: "JUROS", cliente: "Banco", linhaDoFluxo: "Juros" },
      ],
      plano,
      [],
      []
    );
    expect(p.ligacoes.map((l) => [l.categoryId, l.cliente])).toEqual([
      ["c1", "Folha"],
      ["c2", "Folha"],
      ["c3", "Banco"],
      ["c4", "Banco"],
    ]);
    // "Folha" sem linha na planilha: a sugerida pelo nome e pelo lado.
    expect(p.novas).toEqual([
      { nome: "Folha", linha: "pessoal", linhaSugerida: true },
      { nome: "Banco", linha: "juros", linhaSugerida: false },
    ]);
  });

  it("mostra o que não casou, o inválido e o repetido sem gravar nada deles", () => {
    const p = planejarDePara(
      [
        { linha: 2, omie: "Inexistente", cliente: "Folha", linhaDoFluxo: null },
        { linha: 3, omie: "Salários", cliente: "", linhaDoFluxo: null },
        { linha: 4, omie: "Salários", cliente: "Folha", linhaDoFluxo: "Galvanização" },
        { linha: 5, omie: "Salários", cliente: "Folha", linhaDoFluxo: null },
        { linha: 6, omie: "Salários", cliente: "Outra", linhaDoFluxo: null },
      ],
      plano,
      [],
      []
    );
    expect(p.semPar).toEqual([{ linha: 2, omie: "Inexistente" }]);
    expect(p.invalidas.map((i) => [i.linha, i.motivo])).toEqual([
      [3, "sem a categoria do cliente"],
      [4, "linha do fluxo que não reconheço"],
    ]);
    expect(p.ligacoes.map((l) => [l.categoryId, l.cliente])).toEqual([["c1", "Folha"]]);
    expect(p.repetidas).toEqual([{ linha: 6, omie: "Salários" }]);
  });

  it("com o de-para já gravado, diz o que muda e não recria a categoria do cliente", () => {
    const p = planejarDePara(
      [
        { linha: 2, omie: "Salários", cliente: "folha", linhaDoFluxo: null },
        { linha: 3, omie: "FGTS", cliente: "Encargos", linhaDoFluxo: null },
      ],
      plano,
      [
        { id: "k1", name: "Folha", line: "pessoal" },
        { id: "k2", name: "Encargos", line: "impostos" },
      ],
      [
        { categoryId: "c1", clientCategoryId: "k1" },
        { categoryId: "c2", clientCategoryId: "k1" },
      ]
    );
    expect(p.novas).toEqual([]);
    expect(p.ligacoes.map((l) => [l.categoryId, l.muda])).toEqual([
      ["c1", false],
      ["c2", true],
    ]);
    expect(resumoDoPlano(p)).toMatchObject({ ligacoes: 2, mudam: 1, novas: 0, mudamDeLinha: 0 });
  });

  it("no modo de linhas, só cria ou muda a linha das categorias do cliente", () => {
    const p = planejarDePara(
      [
        { linha: 2, omie: "", cliente: "Folha", linhaDoFluxo: "Despesas com Pessoal" },
        { linha: 3, omie: "", cliente: "Encargos", linhaDoFluxo: "Despesas com Pessoal" },
        { linha: 4, omie: "", cliente: "Sem linha", linhaDoFluxo: null },
      ],
      plano,
      [{ id: "k2", name: "Encargos", line: "impostos" }],
      [],
      "linhas"
    );
    expect(p.ligacoes).toEqual([]);
    expect(p.novas).toEqual([{ nome: "Folha", linha: "pessoal", linhaSugerida: false }]);
    expect(p.mudamDeLinha).toEqual([{ id: "k2", nome: "Encargos", de: "impostos", para: "pessoal" }]);
    expect(p.invalidas.map((i) => i.motivo)).toEqual(["sem a linha do fluxo"]);
  });
});
