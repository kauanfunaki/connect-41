import { describe, expect, it } from "vitest";
import { naturezaDaLinha, avaliar, variacao, variacaoPorLinha, mesesDoAcumulado } from "./variacao";
import { gradeVazia, porGrupoOrcado } from "./grade";
import { resultadoDePorGrupo, somarPorGrupo } from "@/lib/dre/analises";
import { LINHAS } from "@/lib/dre/estrutura";

describe("naturezaDaLinha", () => {
  it("grupo de recebimento é receita, de pagamento é despesa, subtotal é resultado, percentual não tem", () => {
    expect(naturezaDaLinha("receita_bruta")).toBe("receita");
    expect(naturezaDaLinha("outras_receitas")).toBe("receita");
    expect(naturezaDaLinha("impostos")).toBe("despesa");
    expect(naturezaDaLinha("administrativas")).toBe("despesa");
    expect(naturezaDaLinha("margem_contribuicao")).toBe("resultado");
    expect(naturezaDaLinha("total_despesas_fixas")).toBe("resultado");
    expect(naturezaDaLinha("cmv_pct")).toBeNull();
    expect(naturezaDaLinha("inexistente")).toBeNull();
  });
});

describe("avaliar — melhor/pior pela semântica", () => {
  it("receita acima do orçado é melhor; abaixo é pior", () => {
    expect(avaliar("receita", 120_000, 100_000)).toBe("melhor");
    expect(avaliar("receita", 80_000, 100_000)).toBe("pior");
  });

  it("despesa acima do orçado é pior; abaixo é melhor (valores negativos da DRE)", () => {
    expect(avaliar("despesa", -150_000, -100_000)).toBe("pior");
    expect(avaliar("despesa", -80_000, -100_000)).toBe("melhor");
    // Despesa sem orçamento que aconteceu: pior.
    expect(avaliar("despesa", -1, 0)).toBe("pior");
  });

  it("resultado e subtotal de despesa acima do orçado são melhores", () => {
    expect(avaliar("resultado", 10_000, -5_000)).toBe("melhor");
    expect(avaliar("resultado", -60_000, -50_000)).toBe("pior");
  });

  it("igual é igual", () => {
    expect(avaliar("despesa", -1, -1)).toBe("igual");
  });
});

describe("variacao", () => {
  it("diferença na convenção da DRE e percentual sobre o |orçado|", () => {
    expect(variacao("administrativas", -150_000, -100_000)).toEqual({
      realizado: -150_000,
      orcado: -100_000,
      diferenca: -50_000,
      percentual: -0.5,
      avaliacao: "pior",
    });
    expect(variacao("receita_bruta", 110_000, 100_000).percentual).toBeCloseTo(0.1);
  });

  it("linha sem orçamento tem percentual nulo — a tela mostra travessão", () => {
    expect(variacao("cmv", -5_000, 0).percentual).toBeNull();
    expect(variacao("cmv", 0, 0)).toMatchObject({ percentual: null, avaliacao: "igual", diferenca: 0 });
  });
});

describe("variacaoPorLinha — mês e acumulado, inclusive subtotais", () => {
  const grade = gradeVazia();
  grade.receita_bruta = [100_000, 100_000, 100_000, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  grade.cmv = [40_000, 40_000, 40_000, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  grade.administrativas = [10_000, 10_000, 10_000, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  const realizadoPorMes = [
    { receita_bruta: 90_000, cmv: -35_000, administrativas: -12_000 },
    { receita_bruta: 120_000, cmv: -50_000, administrativas: -9_000 },
    { receita_bruta: 100_000, cmv: -40_000, administrativas: -10_000 },
  ];

  it("no mês: receita abaixo pior, despesa acima pior, resultado bate com a soma", () => {
    const realizado = resultadoDePorGrupo(somarPorGrupo([realizadoPorMes[0]!]));
    const orcado = resultadoDePorGrupo(porGrupoOrcado(grade, [1]));
    const v = variacaoPorLinha(realizado, orcado);
    expect(v.get("receita_bruta")).toMatchObject({ diferenca: -10_000, avaliacao: "pior" });
    expect(v.get("cmv")).toMatchObject({ diferenca: 5_000, avaliacao: "melhor" });
    expect(v.get("administrativas")).toMatchObject({ diferenca: -2_000, avaliacao: "pior", percentual: -0.2 });
    // Resultado: realizado 43.000 × orçado 50.000.
    expect(v.get("fluxo_de_caixa_livre")).toMatchObject({ realizado: 43_000, orcado: 50_000, diferenca: -7_000, avaliacao: "pior" });
    expect(v.get("total_despesas_fixas")).toMatchObject({ diferenca: -2_000, avaliacao: "pior" });
    // Percentual não entra.
    expect(v.has("cmv_pct")).toBe(false);
  });

  it("no acumulado até março: soma os meses dos dois lados", () => {
    const meses = mesesDoAcumulado(3);
    const realizado = resultadoDePorGrupo(somarPorGrupo(realizadoPorMes));
    const orcado = resultadoDePorGrupo(porGrupoOrcado(grade, meses));
    const v = variacaoPorLinha(realizado, orcado);
    expect(v.get("receita_bruta")).toMatchObject({ realizado: 310_000, orcado: 300_000, avaliacao: "melhor" });
    expect(v.get("cmv")).toMatchObject({ realizado: -125_000, orcado: -120_000, avaliacao: "pior" });
    expect(v.get("fluxo_de_caixa_livre")).toMatchObject({ realizado: 154_000, orcado: 150_000, diferenca: 4_000, avaliacao: "melhor" });
    // A variação do subtotal é a soma das variações das parcelas — mesmo motor.
    const soma = ["receita_bruta", "cmv", "administrativas"].reduce((n, c) => n + v.get(c)!.diferenca, 0);
    expect(v.get("fluxo_de_caixa_livre")!.diferenca).toBe(soma);
  });

  it("a avaliação coincide com o sinal da diferença em toda linha de valor", () => {
    const realizado = resultadoDePorGrupo(somarPorGrupo([realizadoPorMes[1]!]));
    const orcado = resultadoDePorGrupo(porGrupoOrcado(grade, [2]));
    for (const [code, x] of variacaoPorLinha(realizado, orcado)) {
      const esperado = x.diferenca > 0 ? "melhor" : x.diferenca < 0 ? "pior" : "igual";
      expect([code, x.avaliacao]).toEqual([code, esperado]);
    }
    expect(LINHAS.filter((l) => l.tipo !== "percentual").length).toBe(variacaoPorLinha(realizado, orcado).size);
  });
});

describe("mesesDoAcumulado", () => {
  it("de janeiro até o mês, limitado a 1..12", () => {
    expect(mesesDoAcumulado(1)).toEqual([1]);
    expect(mesesDoAcumulado(3)).toEqual([1, 2, 3]);
    expect(mesesDoAcumulado(12)).toHaveLength(12);
    expect(mesesDoAcumulado(15)).toHaveLength(12);
    expect(mesesDoAcumulado(0)).toEqual([1]);
  });
});
