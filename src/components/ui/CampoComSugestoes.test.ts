import { describe, expect, it } from "vitest";
import { filtrarSugestoes, moverDestaque } from "./CampoComSugestoes";

const TIPOS = ["Alvará de funcionamento", "Licença sanitária", "AVCB (Corpo de Bombeiros)", "Licença ambiental", "Certidão de uso do solo"];

describe("filtrarSugestoes", () => {
  it("sem texto, todas — na ordem em que vieram", () => {
    expect(filtrarSugestoes(TIPOS, "")).toEqual(TIPOS);
    expect(filtrarSugestoes(TIPOS, "   ")).toEqual(TIPOS);
  });

  it("ignora acento e caixa", () => {
    expect(filtrarSugestoes(TIPOS, "ALVARA")).toEqual(["Alvará de funcionamento"]);
    expect(filtrarSugestoes(TIPOS, "sanitaria")).toEqual(["Licença sanitária"]);
  });

  it("o que começa pelo texto vem antes do que só tem uma palavra começando por ele, e este antes do meio", () => {
    expect(filtrarSugestoes(["Plano de ação", "Ação trabalhista", "Transação"], "aca")).toEqual([
      "Ação trabalhista",
      "Plano de ação",
      "Transação",
    ]);
  });

  it("palavra depois de parêntese conta como começo de palavra", () => {
    expect(filtrarSugestoes(TIPOS, "corpo")).toEqual(["AVCB (Corpo de Bombeiros)"]);
  });

  it("tira repetidas (sem acento nem caixa) e vazias", () => {
    expect(filtrarSugestoes(["Contábil", "contabil", " ", "Fiscal", "Contábil "], "")).toEqual(["Contábil", "Fiscal"]);
  });

  it("nada casa: lista vazia", () => {
    expect(filtrarSugestoes(TIPOS, "xyz")).toEqual([]);
  });

  it("respeita o limite", () => {
    const muitas = Array.from({ length: 80 }, (_, i) => `Grupo ${i}`);
    expect(filtrarSugestoes(muitas, "", 50)).toHaveLength(50);
  });
});

describe("moverDestaque", () => {
  it("sem destaque, ↓ vai para a primeira e ↑ para a última", () => {
    expect(moverDestaque(-1, 4, 1)).toBe(0);
    expect(moverDestaque(-1, 4, -1)).toBe(3);
  });

  it("dá a volta nas pontas", () => {
    expect(moverDestaque(3, 4, 1)).toBe(0);
    expect(moverDestaque(0, 4, -1)).toBe(3);
    expect(moverDestaque(1, 4, 1)).toBe(2);
  });

  it("lista vazia não destaca nada, e destaque que sobrou da lista anterior recomeça", () => {
    expect(moverDestaque(2, 0, 1)).toBe(-1);
    expect(moverDestaque(7, 3, 1)).toBe(0);
  });
});
