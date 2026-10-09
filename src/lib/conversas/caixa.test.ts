import { describe, expect, it } from "vitest";
import { iniciais, quandoCurto, vizinhas } from "./caixa";

// 09/10/2026, 15:00 em São Paulo (18:00 UTC).
const AGORA = new Date("2026-10-09T18:00:00Z");

describe("a hora do cartão", () => {
  it("hoje mostra a hora; ontem, “Ontem”; no ano, dia e mês; antes, a data", () => {
    expect(quandoCurto(new Date("2026-10-09T11:23:00Z"), AGORA)).toBe("08:23");
    expect(quandoCurto(new Date("2026-10-08T22:00:00Z"), AGORA)).toBe("Ontem");
    expect(quandoCurto(new Date("2026-09-10T15:00:00Z"), AGORA)).toBe("10 set");
    expect(quandoCurto(new Date("2025-12-31T15:00:00Z"), AGORA)).toBe("31/12/2025");
    expect(quandoCurto(null, AGORA)).toBe("");
  });

  it("o dia é o de São Paulo: 01:00 UTC de hoje ainda é ontem lá", () => {
    expect(quandoCurto(new Date("2026-10-09T01:00:00Z"), AGORA)).toBe("Ontem");
  });
});

describe("as iniciais", () => {
  it("primeira e última palavra; uma palavra só, as duas primeiras letras", () => {
    expect(iniciais("Fabrice Edouard")).toBe("FE");
    expect(iniciais("Gabrielle de Souza Dujardin")).toBe("GD");
    expect(iniciais("Padaria")).toBe("PA");
    expect(iniciais("  ")).toBe("#");
    expect(iniciais(null)).toBe("#");
    expect(iniciais("+55 41 99999-0000")).toBe("#");
  });
});

describe("a anterior e a próxima", () => {
  it("acha as vizinhas na lista", () => {
    const lista = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(vizinhas(lista, "b")).toEqual({ anterior: { id: "a" }, proxima: { id: "c" }, posicao: 1 });
    expect(vizinhas(lista, "a").anterior).toBeNull();
    expect(vizinhas(lista, "x")).toEqual({ anterior: null, proxima: null, posicao: -1 });
  });
});
