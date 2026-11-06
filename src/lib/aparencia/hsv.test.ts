import { describe, expect, it } from "vitest";
import { hexParaHsv, hsvParaHex } from "./hsv";

// O seletor de cor livre da Aparência (05/11/2026): quadrado de saturação e
// brilho + faixa de matiz.

describe("hexParaHsv e hsvParaHex", () => {
  it("as cores puras", () => {
    expect(hexParaHsv("#FF0000")).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexParaHsv("00ff00")).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexParaHsv("#00F")).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexParaHsv("#000000")).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexParaHsv("#FFFFFF")).toEqual({ h: 0, s: 0, v: 1 });
  });

  it("ida e volta dá a mesma cor", () => {
    for (const cor of ["#1F5EEA", "#0B7A8A", "#E91E63", "#B4492A", "#3F4B5E", "#EA4335"]) {
      expect(hsvParaHex(hexParaHsv(cor)!)).toBe(cor);
    }
  });

  it("texto que não é cor vira null; HSV fora da faixa é limitado", () => {
    expect(hexParaHsv("azul")).toBeNull();
    expect(hexParaHsv("#12345")).toBeNull();
    expect(hsvParaHex({ h: 360, s: 2, v: -1 })).toBe("#000000");
    expect(hsvParaHex({ h: 360, s: 1, v: 1 })).toBe("#FF0000");
  });
});
