import { describe, expect, it } from "vitest";
import { passoDoNumero } from "./CampoNumero";

describe("passoDoNumero", () => {
  it("anda um passo para cada lado", () => {
    expect(passoDoNumero("4", 1, { min: 0 })).toBe("5");
    expect(passoDoNumero("4", -1, { min: 0 })).toBe("3");
  });

  it("vazio conta como zero, e o mínimo vence", () => {
    expect(passoDoNumero("", 1, { min: 0 })).toBe("1");
    expect(passoDoNumero("", -1, { min: 0 })).toBe("0");
    // A janela da rescisão vai de 3 a 12: o primeiro + já cai no 3.
    expect(passoDoNumero("", 1, { min: 3, max: 12 })).toBe("3");
    expect(passoDoNumero("", 1, {})).toBe("1");
  });

  it("para nos limites", () => {
    expect(passoDoNumero("1", -1, { min: 1 })).toBe("1");
    expect(passoDoNumero("30", 1, { min: 1, max: 30 })).toBe("30");
    expect(passoDoNumero("45", -1, { min: 1, max: 30 })).toBe("30");
  });

  it("valor fora do passo encosta no passo vizinho", () => {
    expect(passoDoNumero("2.3", 1, { min: 0 })).toBe("3");
    expect(passoDoNumero("2.3", -1, { min: 0 })).toBe("2");
  });

  it("passo decimal sem resto de ponto flutuante", () => {
    expect(passoDoNumero("0.2", 1, { min: 0, step: 0.1 })).toBe("0.3");
    expect(passoDoNumero("7.5", 1, { step: 0.25 })).toBe("7.75");
  });

  it("texto que não é número fica como está", () => {
    expect(passoDoNumero("abc", 1, { min: 0 })).toBe("abc");
  });
});
