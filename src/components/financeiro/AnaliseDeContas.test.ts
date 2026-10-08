import { describe, expect, it } from "vitest";
import { linhasDoRanking, segmentosDasFaixas } from "./AnaliseDeContas";
import { faixasDeAtraso, type ContaParaAnalise } from "@/lib/financeiro/analise";
import { moeda } from "@/lib/financeiro/formato";

const HOJE = "2026-10-08";

function conta(vencimentoKey: string, reais: number, contraparteNome = "Papelaria Sul"): ContaParaAnalise {
  return {
    situacao: vencimentoKey < HOJE ? "VENCIDA" : "A_VENCER",
    valorCentavos: Math.round(reais * 100),
    vencimentoKey,
    contraparteNome,
  };
}

describe("segmentosDasFaixas", () => {
  const faixas = faixasDeAtraso(
    [
      conta("2026-10-20", 1000), // a vencer
      conta("2026-10-08", 50), // vence hoje: a vencer
      conta("2026-10-01", 200), // 7 dias
      conta("2026-09-20", 300), // 18 dias
      conta("2026-06-01", 400), // mais de 90
    ],
    HOJE
  );
  const segmentos = segmentosDasFaixas(faixas);
  const porChave = new Map(segmentos.map((s) => [s.chave, s]));

  it("conta as contas no comprimento e escreve o R$ ao lado", () => {
    expect(porChave.get("a_vencer")).toMatchObject({ valor: 2, detalhe: moeda(105_000) });
    expect(porChave.get("acima_90")).toMatchObject({ valor: 1, detalhe: moeda(40_000) });
  });

  it("gradua o atraso: a vencer no próximo, até 30 dias em atenção, acima disso em crítico", () => {
    expect(porChave.get("a_vencer")?.tom).toBe("proximo");
    expect(porChave.get("d1_15")?.tom).toBe("atencao");
    expect(porChave.get("d16_30")?.tom).toBe("atencao");
    expect(porChave.get("acima_90")?.tom).toBe("critico");
  });

  it("deixa neutra a faixa sem conta — zero não pinta a legenda", () => {
    expect(porChave.get("d31_60")).toMatchObject({ valor: 0, tom: "neutro" });
    expect(porChave.get("d61_90")).toMatchObject({ valor: 0, tom: "neutro" });
  });

  it("mantém a ordem das faixas, da que vence à mais atrasada", () => {
    expect(segmentos.map((s) => s.chave)).toEqual(["a_vencer", "d1_15", "d16_30", "d31_60", "d61_90", "acima_90"]);
  });
});

describe("linhasDoRanking", () => {
  it("parte o em aberto em vencido e a vencer, com o vencido escrito embaixo do total", () => {
    const [linha] = linhasDoRanking([
      { contraparteNome: "Gráfica Alfa", emAberto: 120_000, vencido: 30_000, quantidade: 3, participacao: 0.25 },
    ]);
    expect(linha.segmentos).toEqual([
      { chave: "vencido", rotulo: "Vencido", valor: 30_000, tom: "critico" },
      { chave: "a_vencer", rotulo: "A vencer", valor: 90_000, tom: "proximo" },
    ]);
    expect(linha.nota).toBe(`${moeda(30_000)} vencido`);
    expect(linha.sublabel).toBe("3 contas · 25,0% do em aberto");
  });

  it("sem vencido, sem nota; e uma conta no singular", () => {
    const [linha] = linhasDoRanking([
      { contraparteNome: "Papelaria Sul", emAberto: 5_000, vencido: 0, quantidade: 1, participacao: 1 },
    ]);
    expect(linha.nota).toBeUndefined();
    expect(linha.sublabel).toBe("1 conta · 100,0% do em aberto");
  });
});
