import { describe, expect, it } from "vitest";
import { lerNumeroDigitado, textoDoNumero, textoFormatadoDoNumero } from "./numeroDigitado";

describe("número digitado", () => {
  it("vazio é não informado, diferente de zero", () => {
    expect(lerNumeroDigitado("")).toBeNull();
    expect(lerNumeroDigitado("   ")).toBeNull();
    expect(lerNumeroDigitado("0")).toBe(0);
  });

  it("aceita o jeito brasileiro e o ponto decimal", () => {
    expect(lerNumeroDigitado("1.234,56")).toBe(1234.56);
    expect(lerNumeroDigitado("1234,5")).toBe(1234.5);
    expect(lerNumeroDigitado("1234.56")).toBe(1234.56);
    expect(lerNumeroDigitado("8,8")).toBe(8.8);
    expect(lerNumeroDigitado("-10")).toBe(-10);
  });

  it("em dinheiro, ponto com três casas é milhar", () => {
    expect(lerNumeroDigitado("1.234")).toBe(1234);
    expect(lerNumeroDigitado("1.075")).toBe(1075);
    expect(lerNumeroDigitado("1.234.567")).toBe(1234567);
  });

  it("fora de dinheiro (FAP, percentuais), ponto é decimal", () => {
    expect(lerNumeroDigitado("1.075", false)).toBe(1.075);
    expect(lerNumeroDigitado("0.375", false)).toBe(0.375);
    expect(lerNumeroDigitado("1,2345", false)).toBe(1.2345);
    expect(lerNumeroDigitado("1.234.567", false)).toBeUndefined();
  });

  it("estados intermediários da digitação não viram número errado", () => {
    expect(lerNumeroDigitado("12,")).toBe(12);
    expect(lerNumeroDigitado("-")).toBeUndefined();
    expect(lerNumeroDigitado("1,2,3")).toBeUndefined();
    expect(lerNumeroDigitado("abc")).toBeUndefined();
  });

  it("dinheiro fora da edição: milhar e até duas casas, e lê de volta o mesmo valor", () => {
    expect(textoFormatadoDoNumero(1200000)).toBe("1.200.000");
    expect(textoFormatadoDoNumero(1234.5)).toBe("1.234,5");
    expect(textoFormatadoDoNumero(null)).toBe("");
    for (const v of [0, 1200000, 1234.56, 8.8, 999, -10, 0.25]) expect(lerNumeroDigitado(textoFormatadoDoNumero(v))).toBe(v);
  });

  it("demais campos fora da edição: todas as casas, sem milhar, e lê de volta o mesmo valor", () => {
    expect(textoFormatadoDoNumero(1.2345, false)).toBe("1,2345");
    expect(textoFormatadoDoNumero(3650, false)).toBe("3650");
    expect(textoFormatadoDoNumero(8.8, false)).toBe("8,8");
    for (const v of [0.5, 1.2345, 2, 8.8, 100, 3650]) expect(lerNumeroDigitado(textoFormatadoDoNumero(v, false), false)).toBe(v);
  });

  it("escreve com vírgula e sem milhar enquanto se edita", () => {
    expect(textoDoNumero(1234.56)).toBe("1234,56");
    expect(textoDoNumero(0)).toBe("0");
    expect(textoDoNumero(null)).toBe("");
  });
});
