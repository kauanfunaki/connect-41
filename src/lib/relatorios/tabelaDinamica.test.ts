import { describe, expect, it } from "vitest";
import { lerConfiguracao, montarTabela, paramsDaConfiguracao, MAXIMO_DE_LINHAS, VISOES_PRONTAS, type Fato } from "./tabelaDinamica";

const fato = (chave: string, dims: Fato["dims"], valor: number, extra: Fato["medidas"] = {}): Fato => ({ chave, dims, medidas: { valor, ...extra } });

describe("montarTabela", () => {
  const fatos = [
    fato("1", { categoria: "Aluguel", centro: "Loja A", competencia: "2026-09" }, 1_000),
    fato("2", { categoria: "Aluguel", centro: "Loja B", competencia: "2026-10" }, 500),
    // A conta 3 é rateada: duas partes, duas categorias.
    fato("3", { categoria: "Água", centro: "Loja A", competencia: "2026-09" }, 300),
    fato("3", { categoria: "Aluguel", centro: "Loja A", competencia: "2026-09" }, 200),
    fato("4", { categoria: null, competencia: "2026-10" }, 50),
  ];

  it("linhas por categoria, colunas por mês na ordem do tempo, totais que fecham", () => {
    const t = montarTabela(fatos, { linhas: ["categoria"], coluna: "competencia", medida: "valor" });
    expect(t.colunas.map((c) => c.chave)).toEqual(["2026-09", "2026-10"]);
    expect(t.linhas.map((l) => [l.rotulo, l.valores, l.total])).toEqual([
      ["Aluguel", [1_200, 500], 1_700],
      ["Água", [300, 0], 300],
      ["(sem categoria)", [0, 50], 50],
    ]);
    expect(t.totalPorColuna).toEqual([1_500, 550]);
    expect(t.total).toBe(2_050);
  });

  it("dois níveis: subtotais na primeira, o detalhe nas filhas", () => {
    const t = montarTabela(fatos, { linhas: ["centro", "categoria"], coluna: null, medida: "valor" });
    expect(t.colunas).toEqual([{ chave: expect.any(String), rotulo: "Total" }]);
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    expect(lojaA.total).toBe(1_500);
    expect(lojaA.filhas!.map((f) => [f.rotulo, f.total])).toEqual([
      ["Aluguel", 1_200],
      ["Água", 300],
    ]);
  });

  it("a quantidade conta a conta rateada uma vez só, também nos totais", () => {
    const t = montarTabela(fatos, { linhas: ["centro"], coluna: "categoria", medida: "quantidade" });
    const lojaA = t.linhas.find((l) => l.rotulo === "Loja A")!;
    // Na Loja A: conta 1 (Aluguel) e conta 3 (Aluguel e Água) — duas contas, não três.
    expect(lojaA.total).toBe(2);
    expect(t.total).toBe(4);
  });

  it("passa do teto: o resto do primeiro nível vai para Outros", () => {
    const muitos = Array.from({ length: MAXIMO_DE_LINHAS + 5 }, (_, i) => fato(String(i), { contraparte: `F${String(i).padStart(4, "0")}` }, 1 + i));
    const t = montarTabela(muitos, { linhas: ["contraparte"], coluna: null, medida: "valor" });
    expect(t.linhas).toHaveLength(MAXIMO_DE_LINHAS);
    expect(t.linhas.at(-1)!.rotulo).toBe("Outros");
    expect(t.linhasAgrupadas).toBe(6);
    expect(t.total).toBe(muitos.reduce((s, f) => s + f.medidas.valor!, 0));
  });
});

describe("lerConfiguracao", () => {
  const hoje = "2026-10-20";

  it("padrões: contas por categoria e competência, últimos seis meses", () => {
    expect(lerConfiguracao({}, hoje)).toEqual({
      base: "contas",
      linhas: ["categoria"],
      coluna: "competencia",
      medida: "valor",
      filtros: { tipo: "ambos", de: "2026-05", ate: "2026-10", periodoPor: "competencia", situacao: "todas" },
    });
  });

  it("o que não vale na base cai no padrão", () => {
    const c = lerConfiguracao({ base: "baixas", linhas: "situacao,categoria,categoria", coluna: "vencimento", medida: "saldo" }, hoje);
    expect(c.linhas).toEqual(["categoria"]);
    expect(c.coluna).toBeNull();
    expect(c.medida).toBe("valor");
  });

  it("ida e volta pelo endereço", () => {
    const c = lerConfiguracao({ base: "contas", linhas: "contraparte", coluna: "vencimento", medida: "saldo", tipo: "PAGAR", situacao: "abertas", periodo: "todos" }, hoje);
    expect(c.filtros).toMatchObject({ de: null, ate: null, situacao: "abertas", tipo: "PAGAR" });
    const q = Object.fromEntries(paramsDaConfiguracao(c));
    expect(lerConfiguracao(q, hoje)).toEqual(c);
  });

  it("as visões prontas valem na base delas", () => {
    for (const v of VISOES_PRONTAS) {
      const c = lerConfiguracao(v.params, hoje);
      expect(c.linhas.join(","), v.id).toBe(v.params.linhas);
      expect(c.coluna, v.id).toBe(v.params.coluna);
      expect(c.medida, v.id).toBe(v.params.medida);
    }
  });
});
