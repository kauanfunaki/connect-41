// As contas da tela dos cartões (Bloco C, Fase C3, 23/11/2026): o dinheiro digitado em centavos, sem
// ponto flutuante, a divisão de um gasto e a revisão do rascunho lido.

import { describe, expect, test } from "vitest";
import {
  centavosDigitados,
  itensFecham,
  itensParaEnviar,
  nomeDaCompetencia,
  partesParaEnviar,
  problemaDaDivisao,
  rascunhoDe,
  somaEmCentavos,
  textoDeCentavos,
  valorParaCampo,
} from "./telaDosCartoes";

describe("dinheiro da tela", () => {
  test("lê o valor digitado nos formatos brasileiro e do servidor", () => {
    expect(centavosDigitados("1.234,56")).toBe(BigInt(123456));
    expect(centavosDigitados("1234,5")).toBe(BigInt(123450));
    expect(centavosDigitados("R$ 10")).toBe(BigInt(1000));
    expect(centavosDigitados("1500.00")).toBe(BigInt(150000));
    expect(centavosDigitados("0,1")).toBe(BigInt(10));
    // Ponto com três dígitos depois é o milhar, como se digita no Brasil.
    expect(centavosDigitados("10.005")).toBe(BigInt(1000500));
  });

  test("recusa o que não é valor com até duas casas", () => {
    for (const t of ["", "abc", "1,234", "10.0055", "-5", "1e3", "1.234.5"]) expect(centavosDigitados(t)).toBeNull();
  });

  test("devolve o texto do servidor e soma sem ponto flutuante", () => {
    expect(textoDeCentavos(BigInt(5))).toBe("0.05");
    expect(textoDeCentavos(BigInt(-12345))).toBe("-123.45");
    expect(somaEmCentavos(["0,10", "0,20"])).toBe(BigInt(30));
    expect(somaEmCentavos(["1", "x"])).toBeNull();
    expect(valorParaCampo("1500.00")).toBe("1500,00");
    expect(valorParaCampo(null)).toBe("");
  });

  test("dá nome à competência", () => {
    expect(nomeDaCompetencia("2026-04")).toBe("abril de 2026");
    expect(nomeDaCompetencia("x")).toBe("x");
  });
});

describe("divisão de um gasto", () => {
  const parte = { conta_id: "c1", historico: "UBER", valor: "10,00" };

  test("aceita partes que não passam do gasto", () => {
    expect(problemaDaDivisao([parte, { ...parte, valor: "10" }], "20.00")).toBeNull();
  });

  test("recusa conta, histórico, valor e o total acima do gasto", () => {
    expect(problemaDaDivisao([], "1")).toMatch(/ao menos/);
    expect(problemaDaDivisao([{ ...parte, conta_id: "" }], "20")).toMatch(/conta/);
    expect(problemaDaDivisao([{ ...parte, historico: " x " }], "20")).toMatch(/histórico/);
    expect(problemaDaDivisao([{ ...parte, valor: "0" }], "20")).toMatch(/valor positivo/);
    expect(problemaDaDivisao([parte, parte, parte], "20.00")).toMatch(/passam/);
  });

  test("manda o valor com duas casas e o histórico aparado", () => {
    expect(partesParaEnviar([{ conta_id: "c1", historico: " UBER ", valor: "1.000,5" }])).toEqual([{ conta_id: "c1", historico: "UBER", valor: "1000.50" }]);
  });
});

describe("revisão do rascunho", () => {
  test("os itens fecham o total declarado", () => {
    const itens = [
      { data: "2026-03-01", descricao: "UBER", valor: "20,00" },
      { data: "2026-03-01", descricao: "UBER", valor: "20.00" },
    ];
    expect(itensFecham(itens, "40")).toBe(true);
    expect(itensFecham(itens, "20,00")).toBe(false);
    expect(itensFecham([], "0")).toBe(false);
  });

  test("manda os itens no formato do servidor, com a referência", () => {
    expect(itensParaEnviar([{ data: "2026-03-01", descricao: " A ", valor: "1,5" }])).toEqual([{ data: "2026-03-01", descricao: "A", valor: "1.50", referencia: "1" }]);
    expect(itensParaEnviar([{ data: "2026-03-01", descricao: "A", valor: "x", referencia: "Página 1, item 2" }])[0]).toMatchObject({ valor: "x", referencia: "Página 1, item 2" });
  });

  test("o resultado que não é objeto vira rascunho vazio", () => {
    expect(rascunhoDe(null)).toEqual({});
    expect(rascunhoDe([1])).toEqual({});
    expect(rascunhoDe({ total: "10.00" })).toEqual({ total: "10.00" });
  });
});
