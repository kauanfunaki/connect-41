import { describe, expect, it } from "vitest";
import { lerNumero, lerInteiro } from "./entrada";
import { compararValores, lerComparativo } from "./comparativo";

describe("lerNumero", () => {
  it.each([
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["R$ 3.000,00", 3000],
    ["1.234", 1234],
    ["7,5", 7.5],
    ["7,5%", 7.5],
    ["-10,00", -10],
    ["1.234.567,89", 1234567.89],
  ])("%s → %d", (bruto, esperado) => {
    expect(lerNumero(bruto)).toBe(esperado);
  });

  it("vazio ou ilegível é nulo", () => {
    expect(lerNumero("")).toBeNull();
    expect(lerNumero("abc")).toBeNull();
    expect(lerNumero(null)).toBeNull();
    expect(lerInteiro("2,5")).toBeNull();
    expect(lerInteiro("3")).toBe(3);
  });
});

describe("comparativo com a Domínio", () => {
  it("lê o colado do Excel (tabulação) e de CSV (;), pulando o cabeçalho", () => {
    const r = lerComparativo("CPF\tProventos\tDescontos\tLíquido\n123.456.789-09\t3.243,89\t277,87\t2.966,02\t277,87\t0\t259,51\n98765432100;1500;100;1400;;;");
    expect(r.erros).toEqual([]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toMatchObject({ cpf: "12345678909", proventos: 3243.89, liquido: 2966.02, fgts: 259.51 });
    expect(r.linhas[1]).toMatchObject({ cpf: "98765432100", inss: null });
  });

  it("aponta CPF ruim no meio", () => {
    expect(lerComparativo("12345678909;1\n123;2").erros).toEqual(["Linha 2: CPF não reconhecido."]);
  });

  it("diferença de 1 centavo não diverge; campo vazio não compara", () => {
    const dp2 = { proventos: 3243.89, descontos: 277.87, liquido: 2966.02, inss: 277.87, irrf: 0, fgts: 259.51 };
    expect(compararValores(dp2, { proventos: 3243.88, inss: null }).diverge).toBe(false);
    const r = compararValores(dp2, { liquido: 2960 });
    expect(r.diverge).toBe(true);
    expect(r.diferencas.liquido).toBe(6.02);
  });
});
