import { describe, expect, it } from "vitest";
import { evolucaoEmTexto, mesesAntes, montarEvolucao, numeroDoMesEmTexto, placarPorSetor } from "./evolucao";
import type { PosicaoNoRanking } from "./ranking";

const p = (userId: string, pontos: number, extra: Partial<PosicaoNoRanking> = {}): PosicaoNoRanking => ({
  posicao: 1, userId, nivel: "medio", niveis: ["medio"], sectorCode: "fiscal", ppm: Math.round(pontos), acertos: null, total: null,
  precisao: 95, pontos, tentativas: 3, duracaoMs: 60_000, ...extra,
});

describe("montarEvolucao", () => {
  it("compara o mês com a média dos meses anteriores em que a pessoa fez o teste", () => {
    const { ranking, todas } = montarEvolucao("digitacao", [p("ana", 60), p("bia", 50)], [[p("ana", 50), p("bia", 55)], [p("ana", 40)]]);
    // Ana: média de 50 e 40 = 45 → 60 é +33,3%. Bia: 55 → 50 é −9,1%.
    expect(ranking).toHaveLength(1);
    expect(ranking[0]).toMatchObject({ posicao: 1, userId: "ana", media: 45, evolucao: 33.3, mesesNaMedia: 2 });
    expect(todas.get("bia")).toMatchObject({ evolucao: -9.1 });
  });

  it("precisa de 3 tentativas no mês e de algum mês anterior", () => {
    const { todas } = montarEvolucao("digitacao", [p("ana", 60, { tentativas: 2 }), p("caio", 70)], [[p("ana", 50)]]);
    expect(todas.size).toBe(0);
  });

  it("na lógica, compara a precisão", () => {
    const { ranking } = montarEvolucao("logica", [p("ana", 300, { precisao: 90 })], [[p("ana", 100, { precisao: 60 })]]);
    expect(ranking[0].evolucao).toBe(50);
  });

  it("ordem pela evolução; empate, pelo número do mês", () => {
    const { ranking } = montarEvolucao("digitacao", [p("ana", 60), p("bia", 120)], [[p("ana", 50), p("bia", 100)]]);
    expect(ranking.map((l) => l.userId)).toEqual(["bia", "ana"]);
  });
});

describe("placarPorSetor", () => {
  it("média por setor, só setores com o mínimo de pessoas, e sem setor fica de fora", () => {
    const doMes = [
      p("a", 60, { sectorCode: "fiscal" }), p("b", 50, { sectorCode: "fiscal" }), p("c", 40, { sectorCode: "fiscal" }),
      p("d", 90, { sectorCode: "dp" }), p("e", 80, { sectorCode: "dp" }),
      p("f", 70, { sectorCode: "bpo" }), p("g", 70, { sectorCode: "bpo" }), p("h", 70, { sectorCode: "bpo" }),
      p("i", 100, { sectorCode: null }),
    ];
    expect(placarPorSetor("digitacao", doMes)).toEqual([
      { posicao: 1, sectorCode: "bpo", media: 70, pessoas: 3 },
      { posicao: 2, sectorCode: "fiscal", media: 50, pessoas: 3 },
    ]);
  });
});

describe("textos", () => {
  it("números e evolução", () => {
    expect(numeroDoMesEmTexto("digitacao", 54.4)).toBe("54 PPM");
    expect(numeroDoMesEmTexto("logica", 77.5)).toBe("77,5%");
    expect(numeroDoMesEmTexto("atalhos", 23)).toBe("23 acertos");
    expect(evolucaoEmTexto(18.5)).toBe("+18,5%");
    expect(evolucaoEmTexto(-4)).toBe("−4%");
  });

  it("os meses antes", () => {
    expect(mesesAntes("2026-02", 3)).toEqual(["2026-01", "2025-12", "2025-11"]);
  });
});
