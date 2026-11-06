import { describe, expect, it } from "vitest";
import { entregueNoPrazo, porcentagem, produtividadePorPessoa } from "./produtividade";
import type { Classificacao, ItemDeTrabalho } from "./regras";

// A produtividade por pessoa (05/11/2026, Gestão C): entregues no período, no
// prazo, carga de agora e horas pelo cronômetro.

const periodo = { de: new Date("2026-10-01T03:00:00Z"), ate: new Date("2026-11-01T03:00:00Z") };
const aberto: Classificacao = { coluna: "ANDAMENTO", parado: null, paradoDeProposito: false, prazo: null };
const item = (p: Partial<ItemDeTrabalho>): ItemDeTrabalho => ({
  origem: "CARD", id: Math.random().toString(36), titulo: "x", setor: "bpo", responsaveis: ["ana"], estado: "CONCLUIDO",
  ultimaMovimentacao: new Date("2026-10-10T12:00:00Z"), prazo: null, concluidoEm: new Date("2026-10-10T12:00:00Z"), href: "/", ...p,
});

describe("entregueNoPrazo", () => {
  it("vale o dia do prazo inteiro, em São Paulo", () => {
    // Prazo 10/10; terminou 10/10 às 23h de São Paulo (02h UTC do dia 11): no prazo.
    expect(entregueNoPrazo({ prazo: new Date("2026-10-10T15:00:00Z"), concluidoEm: new Date("2026-10-11T02:00:00Z") })).toBe(true);
    expect(entregueNoPrazo({ prazo: new Date("2026-10-10T15:00:00Z"), concluidoEm: new Date("2026-10-11T12:00:00Z") })).toBe(false);
    expect(entregueNoPrazo({ prazo: null, concluidoEm: new Date() })).toBeNull();
  });
});

describe("produtividadePorPessoa", () => {
  it("conta entregues do período por origem e no prazo; fora do período não conta", () => {
    const linhas = produtividadePorPessoa(
      [
        { item: item({ origem: "PROCESSO", prazo: new Date("2026-10-20T12:00:00Z") }), c: aberto },
        { item: item({ origem: "CARD", prazo: new Date("2026-10-05T12:00:00Z") }), c: aberto },
        { item: item({ origem: "CARD" }), c: aberto },
        { item: item({ concluidoEm: new Date("2026-09-20T12:00:00Z") }), c: aberto },
      ],
      [],
      periodo,
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ userId: "ana", setor: "bpo", entregues: 3, comPrazo: 2, noPrazo: 1, porOrigem: { PROCESSO: 1, CARD: 2 } });
  });

  it("a carga de agora: em aberto, parado (sem contar o de propósito) e vencido", () => {
    const linhas = produtividadePorPessoa(
      [
        { item: item({ estado: "ANDAMENTO", concluidoEm: null }), c: { coluna: "PARADO", parado: 12, paradoDeProposito: false, prazo: { situacao: "VENCIDO", dias: 2 } } },
        { item: item({ estado: "ESPERANDO_CLIENTE", concluidoEm: null }), c: { coluna: "PARADO", parado: null, paradoDeProposito: true, prazo: null } },
      ],
      [],
      periodo,
    );
    expect(linhas[0]).toMatchObject({ emAberto: 2, parados: 1, vencidos: 1, entregues: 0 });
  });

  it("item com dois responsáveis conta para os dois; setores diferentes viram linhas diferentes", () => {
    const linhas = produtividadePorPessoa(
      [
        { item: item({ responsaveis: ["ana", "bia"] }), c: aberto },
        { item: item({ setor: "dp" }), c: aberto },
      ],
      [],
      periodo,
    );
    expect(linhas.map((l) => `${l.userId}:${l.setor}:${l.entregues}`).sort()).toEqual(["ana:bpo:1", "ana:dp:1", "bia:bpo:1"]);
  });

  it("horas do período, com quanto veio do cronômetro", () => {
    const linhas = produtividadePorPessoa([], [
      { userId: "ana", setor: "bpo", minutos: 120, origem: "CRONOMETRO" },
      { userId: "ana", setor: "bpo", minutos: 60, origem: "MANUAL" },
      { userId: "ana", setor: "bpo", minutos: 30, origem: null },
    ], periodo);
    expect(linhas[0]).toMatchObject({ minutos: 210, minutosDoCronometro: 120 });
  });
});

describe("porcentagem", () => {
  it("inteira, e nula sem base", () => {
    expect(porcentagem(1, 3)).toBe(33);
    expect(porcentagem(0, 0)).toBeNull();
  });
});
