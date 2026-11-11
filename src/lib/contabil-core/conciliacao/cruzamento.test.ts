// Testes-gabarito do cruzamento razão × extrato (porte de `cruzamento.py`, 11/11/2026).
//
// `gabarito/cruzamento-casos.json` foi gerado por `scripts/contabil-core/gabarito_cruzamento.py`: as
// chamadas feitas pela suíte do original (testes de unidade e de integração) e milhares de casos
// inventados com semente fixa, cada um com a entrada e a saída exatas do Python. Aqui cada chamada é
// repetida no porte. Se um gabarito falhar, o porte está errado, e não o gabarito.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { dec, texto } from "../motor/decimal";
import {
  AGRUPADO,
  CONCILIADO,
  DATA_DIFERENTE,
  DUPLICIDADE_RAZAO,
  LOTE_SISPAG_DIVERGENTE,
  VALOR_DIVERGENTE,
  conciliar,
  diferenca,
  especieDeAplicacao,
  type Grupo,
  type Item,
  type PagamentoParaLote,
} from "./cruzamento";
import type { PagamentoSispag } from "./sispag";

type ItemJson = [string, string, string, string];
type PagamentoJson = [string, string, string, string, boolean];
type GrupoJson = [string, string[], string[], number[], string];
type Caso =
  | {
      fn: "conciliar";
      razao: ItemJson[];
      extrato: ItemJson[];
      periodo_inicio: string | null;
      tolerancia_dias: number;
      sispag: PagamentoJson[] | null;
      result?: { conciliados: GrupoJson[]; pendencias: GrupoJson[]; abertura: string[]; aplicacao_sem_extrato: string[] };
      error?: { tipo: string; mensagem: string };
    }
  | { fn: "especie_de_aplicacao"; historico: string; valor: string; result?: string | null; error?: { tipo: string; mensagem: string } };

const casos = JSON.parse(readFileSync(path.join(__dirname, "gabarito", "cruzamento-casos.json"), "utf8")) as Caso[];

const item = ([id, data, valor, historico]: ItemJson): Item => ({ id, data, valor: dec(valor), historico });
const pagamento = ([data, valor, tipo, favorecido, efetuado]: PagamentoJson): PagamentoParaLote => ({
  data,
  valor: dec(valor),
  tipo,
  favorecido,
  efetuado,
});

function rodarConciliar(caso: Extract<Caso, { fn: "conciliar" }>) {
  const sispag = caso.sispag === null ? null : caso.sispag.map(pagamento);
  const res = conciliar(caso.razao.map(item), caso.extrato.map(item), {
    periodoInicio: caso.periodo_inicio,
    toleranciaDias: caso.tolerancia_dias,
    sispag,
  });
  const grupo = (g: Grupo): GrupoJson => [
    g.tipo,
    g.razao.map((i) => i.id),
    g.extrato.map((i) => i.id),
    g.sispagFaltando.map((p) => (sispag ?? []).indexOf(p)),
    texto(diferenca(g)),
  ];
  return {
    conciliados: res.conciliados.map(grupo),
    pendencias: res.pendencias.map(grupo),
    abertura: res.abertura.map((i) => i.id),
    aplicacao_sem_extrato: res.aplicacaoSemExtrato.map((i) => i.id),
  };
}

describe("gabarito do cruzamento (saída do Python)", () => {
  test("o gabarito tem casos das duas funções", () => {
    expect(casos.filter((c) => c.fn === "conciliar").length).toBeGreaterThan(500);
    expect(casos.filter((c) => c.fn === "especie_de_aplicacao").length).toBeGreaterThan(50);
  });

  test("conciliar", () => {
    let conferidos = 0;
    for (const [n, caso] of casos.entries()) {
      if (caso.fn !== "conciliar") continue;
      expect(caso.error, `caso ${n}`).toBeUndefined();
      expect(rodarConciliar(caso), `caso ${n}`).toEqual(caso.result);
      conferidos++;
    }
    expect(conferidos).toBeGreaterThan(0);
  }, 120_000);

  test("especie_de_aplicacao", () => {
    for (const caso of casos) {
      if (caso.fn !== "especie_de_aplicacao") continue;
      expect(especieDeAplicacao(caso.historico, dec(caso.valor)), JSON.stringify(caso)).toBe(caso.result);
    }
  });
});

describe("camadas (casos do original)", () => {
  const r = (i: number, dia: number, valor: string, hist = "SISPAG FORNECEDORES"): Item => ({
    id: `r${i}`,
    data: `2025-02-${String(dia).padStart(2, "0")}`,
    valor: dec(valor),
    historico: hist,
  });
  const e = (i: number, dia: number, valor: string, hist = "Sispag Fornecedores"): Item => ({
    id: `e${i}`,
    data: `2025-02-${String(dia).padStart(2, "0")}`,
    valor: dec(valor),
    historico: hist,
  });

  test("o histórico decide o par entre dois lançamentos de mesmo dia e valor", () => {
    const res = conciliar(
      [r(1, 24, "520000.00", "TRANSFERENCIA ENTRE CONTAS"), r(2, 24, "520000.00", "VALOR REF FULANO EXPRESS LTDA")],
      [e(1, 24, "520000.00", "Sispag FULANO EXPRESS LT")],
    );
    expect(res.conciliados.map((g) => [g.tipo, g.razao[0].id])).toEqual([[CONCILIADO, "r2"]]);
    expect(res.pendencias.map((g) => [g.tipo, g.razao[0].id])).toEqual([[DUPLICIDADE_RAZAO, "r1"]]);
  });

  test("datas próximas, agrupamento e valor divergente", () => {
    expect(conciliar([r(1, 10, "-800.00")], [e(1, 11, "-800.00")]).conciliados[0].tipo).toBe(DATA_DIFERENTE);
    expect(conciliar([r(1, 6, "-100.00"), r(2, 6, "-250.50"), r(3, 6, "-49.50")], [e(1, 6, "-400.00")]).conciliados[0].tipo).toBe(AGRUPADO);
    const [g] = conciliar([r(1, 6, "-222177.98")], [e(1, 6, "-222185.00")]).pendencias;
    expect(g.tipo).toBe(VALOR_DIVERGENTE);
    expect(texto(diferenca(g))).toBe("7.02");
  });

  test("pagamento do lote SISPAG que falta no razão vira pendência com o nome", () => {
    const valores = ["6454.65", "2470.92", "1456.00", "367.92"];
    const nomes = ["ANTONELLA", "RICARDO", "MAICON", "RODRIGO"];
    const dia = "2025-04-08";
    const razao = valores.slice(0, -1).map((v, i): Item => ({ id: `r${i}`, data: dia, valor: dec(`-${v}`), historico: `PGTO ${nomes[i]} EXEMPLO` }));
    const total = "10749.49";
    const sispag = valores.map((v, i): PagamentoParaLote => ({ data: dia, valor: dec(v), tipo: "Conta Corrente", favorecido: `${nomes[i]} EXEMPLO DA SILVA`, efetuado: true }));
    // 3 do razão e 1 do extrato: sem SISPAG a camada 3 não fecha (a soma não bate).
    const res = conciliar(razao, [{ id: "e1", data: dia, valor: dec(`-${total}`), historico: "Sispag Fornecedores" }], { sispag });
    const [grupo] = res.pendencias;
    expect(grupo.tipo).toBe(LOTE_SISPAG_DIVERGENTE);
    expect(grupo.sispagFaltando.map((p) => p.favorecido)).toEqual(["RODRIGO EXEMPLO DA SILVA"]);
    expect(texto(diferenca(grupo))).toBe("367.92");
  });
});

// A consulta do SISPAG lida por `sispag.ts` entra direto no cruzamento (checagem de tipos).
test("o pagamento do leitor do SISPAG serve ao cruzamento", () => {
  const ligacao = (p: PagamentoSispag): PagamentoParaLote => p;
  expect(typeof ligacao).toBe("function");
});
