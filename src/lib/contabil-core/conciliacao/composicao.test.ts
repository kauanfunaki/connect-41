// Testes-gabarito da composição SISPAG (porte de `composicao.py`, 11/11/2026).
//
// `gabarito/composicao-casos.json` foi gerado por `scripts/contabil-core/gabarito_cruzamento.py`: as
// chamadas da suíte do original e milhares de casos inventados com semente fixa, com a entrada e a
// saída exatas do Python. Se um gabarito falhar, o porte está errado, e não o gabarito.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { dec } from "../motor/decimal";
import { comporPorValoresSispag, comporSispag, indicarParcelasIguais, type ComposicaoCalculada } from "./composicao";

type Erro = { tipo: string; mensagem: string };
type ComposicaoJson = [number, number[], number[], string, string];
type Caso =
  | {
      fn: "compor_sispag" | "compor_por_valores_sispag";
      razao: [number, string, string | null][];
      extrato: [number, string][];
      sispag_faltando: string[];
      result?: ComposicaoJson[];
      error?: Erro;
    }
  | { fn: "indicar_parcelas_iguais"; razao: [number, string][]; extrato: [number, string][]; result?: number | null; error?: Erro };

const casos = JSON.parse(readFileSync(path.join(__dirname, "gabarito", "composicao-casos.json"), "utf8")) as Caso[];

const comoJson = (lista: ComposicaoCalculada[]): ComposicaoJson[] =>
  lista.map((c) => [c.extratoIndice, c.razaoIndices, c.sispagFaltandoIndices, c.criterio, c.confianca]);

describe("gabarito da composição (saída do Python)", () => {
  test("o gabarito tem casos das três funções", () => {
    for (const fn of ["compor_sispag", "compor_por_valores_sispag", "indicar_parcelas_iguais"]) {
      expect(casos.filter((c) => c.fn === fn).length, fn).toBeGreaterThan(100);
    }
    // a sugestão por lote e a confirmação aparecem de verdade
    const criterios = new Set(casos.flatMap((c) => (c.fn !== "indicar_parcelas_iguais" && c.result ? c.result.map((x) => x[3]) : [])));
    expect([...criterios].sort()).toEqual(["SOMA_UNICA_POR_VALORES_SISPAG", "SUGESTAO_POR_LOTES_E_SOMA"]);
  });

  test("compor_sispag e compor_por_valores_sispag", () => {
    for (const [n, caso] of casos.entries()) {
      if (caso.fn === "indicar_parcelas_iguais") continue;
      expect(caso.error, `caso ${n}`).toBeUndefined();
      const razao = caso.razao.map(([indice, valor, lote]) => ({ indice, valor: dec(valor), lote }));
      const extrato = caso.extrato.map(([indice, valor]) => ({ indice, valor: dec(valor) }));
      const faltando = caso.sispag_faltando.map(dec);
      const fn = caso.fn === "compor_sispag" ? comporSispag : comporPorValoresSispag;
      expect(comoJson(fn(razao, extrato, faltando)), `caso ${n}`).toEqual(caso.result);
    }
  }, 120_000);

  test("indicar_parcelas_iguais", () => {
    for (const [n, caso] of casos.entries()) {
      if (caso.fn !== "indicar_parcelas_iguais") continue;
      expect(caso.error, `caso ${n}`).toBeUndefined();
      const razao = caso.razao.map(([indice, valor]) => ({ indice, valor: dec(valor) }));
      const extrato = caso.extrato.map(([indice, valor]) => ({ indice, valor: dec(valor) }));
      expect(indicarParcelasIguais(razao, extrato), `caso ${n}`).toBe(caso.result);
    }
  });
});

describe("composição (casos do original)", () => {
  const razao = (...valores: string[]) => valores.map((v, indice) => ({ indice, valor: dec(`-${v}`) }));
  const extrato = (...valores: string[]) => valores.map((v, indice) => ({ indice, valor: dec(`-${v}`) }));

  test("elimina o valor igual e compõe o restante por soma", () => {
    const r = comporPorValoresSispag(razao("125.00", "40.00", "35.00", "25.00"), extrato("125.00", "100.00"), []);
    expect(comoJson(r)).toEqual([
      [0, [0], [], "SOMA_UNICA_POR_VALORES_SISPAG", "CONFIRMADA"],
      [1, [1, 2, 3], [], "SOMA_UNICA_POR_VALORES_SISPAG", "CONFIRMADA"],
    ]);
  });

  test("valores ambíguos: a ordem do lote sugere a divisão", () => {
    const comLote = [["10", "60.00"], ["11", "40.00"], ["12", "70.00"], ["14", "20.00"]].map(([lote, v], indice) => ({
      indice,
      valor: dec(`-${v}`),
      lote,
    }));
    expect(comporPorValoresSispag(comLote, extrato("100.00", "120.00"), [dec("30.00")])).toEqual([]);
    const r = comporSispag(comLote, extrato("100.00", "120.00"), [dec("30.00")]);
    expect(comoJson(r)).toEqual([
      [0, [0, 1], [], "SUGESTAO_POR_LOTES_E_SOMA", "SUGERIDA"],
      [1, [2, 3], [0], "SUGESTAO_POR_LOTES_E_SOMA", "SUGERIDA"],
    ]);
  });

  test("parcelas iguais com ajuste na última", () => {
    const parcelas = ["50", "50", "50", "50", "50", "50.05"].map((v, indice) => ({ indice, valor: dec(v) }));
    expect(indicarParcelasIguais([{ indice: 7, valor: dec("300.05") }], parcelas)).toBe(7);
    expect(indicarParcelasIguais([{ indice: 0, valor: dec("100") }, { indice: 1, valor: dec("100") }], parcelas.slice(0, 2))).toBeNull();
  });
});
