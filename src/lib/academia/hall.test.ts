import { describe, expect, it } from "vitest";
import { campeoesDoMes } from "./hall";
import type { PosicaoNoRanking } from "./ranking";
import type { LinhaDaEvolucao } from "./evolucao";

const p = (posicao: number, userId: string, ppm: number): PosicaoNoRanking => ({
  posicao, userId, nivel: "medio", niveis: ["medio"], sectorCode: null, ppm, acertos: null, total: null, precisao: 96, pontos: ppm, tentativas: 3, duracaoMs: 60_000,
});
const e = (userId: string, evolucao: number, atual: number): LinhaDaEvolucao => ({
  posicao: 1, userId, sectorCode: null, atual, media: atual / (1 + evolucao / 100), evolucao, tentativas: 3, mesesNaMedia: 2,
});

describe("campeoesDoMes", () => {
  it("o pódio de cada teste e a maior evolução entre os testes", () => {
    const vazio = { digitacao: [], numeros: [], logica: [], atalhos: [] };
    const c = campeoesDoMes(
      { ...vazio, digitacao: [p(1, "ana", 70), p(2, "bia", 60), p(3, "caio", 50), p(4, "davi", 40)] },
      { ...vazio, digitacao: [e("bia", 12, 60)], numeros: [e("davi", 30.5, 40)] },
    );
    expect(c.filter((x) => x.categoria === "digitacao").map((x) => [x.posicao, x.userId, x.valor])).toEqual([
      [1, "ana", "70 PPM · 96%"],
      [2, "bia", "60 PPM · 96%"],
      [3, "caio", "50 PPM · 96%"],
    ]);
    expect(c.find((x) => x.categoria === "evolucao")).toEqual({ categoria: "evolucao", posicao: 1, userId: "davi", teste: "numeros", valor: "+30,5% em Números (40 PPM)" });
  });

  it("mês sem resultado: ninguém", () => {
    const vazio = { digitacao: [], numeros: [], logica: [], atalhos: [] };
    expect(campeoesDoMes(vazio, vazio)).toEqual([]);
  });
});
