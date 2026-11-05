import { describe, expect, it } from "vitest";
import { lerNumeroDigitado, textoDoNumero } from "./numeroDigitado";

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
    expect(lerNumeroDigitado("1.234")).toBe(1234);
    expect(lerNumeroDigitado("1.234.567")).toBe(1234567);
    expect(lerNumeroDigitado("8,8")).toBe(8.8);
    expect(lerNumeroDigitado("-10")).toBe(-10);
  });

  it("estados intermediários da digitação não viram número errado", () => {
    expect(lerNumeroDigitado("12,")).toBe(12);
    expect(lerNumeroDigitado("-")).toBeUndefined();
    expect(lerNumeroDigitado("1,2,3")).toBeUndefined();
    expect(lerNumeroDigitado("abc")).toBeUndefined();
  });

  it("escreve com vírgula e sem milhar enquanto se edita", () => {
    expect(textoDoNumero(1234.56)).toBe("1234,56");
    expect(textoDoNumero(0)).toBe("0");
    expect(textoDoNumero(null)).toBe("");
  });
});
