import { describe, expect, it } from "vitest";
import { consolidateScorecards, scorecardAverage } from "./scorecard";

describe("scorecardAverage", () => {
  it("faz a média só dos critérios preenchidos", () => {
    expect(scorecardAverage({ comunicacao: 4, tecnico: 5, fitCultural: null, experiencia: 3 })).toBe(4);
  });
  it("arredonda a uma casa", () => {
    expect(scorecardAverage({ comunicacao: 5, tecnico: 4, fitCultural: 4, experiencia: null })).toBe(4.3);
  });
  it("retorna null quando nada foi pontuado", () => {
    expect(scorecardAverage({ comunicacao: null, tecnico: null, fitCultural: null, experiencia: null })).toBeNull();
  });
});

describe("consolidateScorecards", () => {
  it("consolida média das médias + tally de recomendações", () => {
    const c = consolidateScorecards([
      { comunicacao: 4, tecnico: 4, fitCultural: 4, experiencia: 4, recommendation: "AVANCAR" },
      { comunicacao: 2, tecnico: 2, fitCultural: 2, experiencia: 2, recommendation: "REPROVAR" },
      { comunicacao: null, tecnico: null, fitCultural: null, experiencia: null, recommendation: "TALVEZ" },
    ]);
    expect(c.count).toBe(3);
    expect(c.averageScore).toBe(3); // média de 4 e 2 (o terceiro não tem nota)
    expect(c.tally).toEqual({ AVANCAR: 1, TALVEZ: 1, REPROVAR: 1 });
  });

  it("lida com lista vazia", () => {
    const c = consolidateScorecards([]);
    expect(c.count).toBe(0);
    expect(c.averageScore).toBeNull();
    expect(c.tally).toEqual({ AVANCAR: 0, TALVEZ: 0, REPROVAR: 0 });
  });
});
