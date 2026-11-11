import { describe, expect, it } from "vitest";
import { indiceDoDesafio, segundaDaSemana, sequenciaDeDias } from "./sequencia";

// Novembro de 2026: 02 e 09 são segundas; 07 e 08, sábado e domingo; 11 é quarta.

describe("sequenciaDeDias", () => {
  it("sem dia feito, zero", () => {
    expect(sequenciaDeDias([], "2026-11-11")).toEqual({ atual: 0, maior: 0, feitoHoje: false, folgaUsada: false });
  });

  it("dias seguidos contam, e hoje feito entra", () => {
    const s = sequenciaDeDias(["2026-11-09", "2026-11-10", "2026-11-11"], "2026-11-11");
    expect(s).toMatchObject({ atual: 3, maior: 3, feitoHoje: true });
  });

  it("hoje ainda sem o desafio não quebra", () => {
    expect(sequenciaDeDias(["2026-11-09", "2026-11-10"], "2026-11-11").atual).toBe(2);
  });

  it("o fim de semana não quebra", () => {
    // Quinta e sexta, pula sábado e domingo, segunda.
    expect(sequenciaDeDias(["2026-11-05", "2026-11-06", "2026-11-09"], "2026-11-09").atual).toBe(3);
  });

  it("o fim de semana feito também conta", () => {
    expect(sequenciaDeDias(["2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09"], "2026-11-09").atual).toBe(4);
  });

  it("um dia útil perdido na semana é perdoado", () => {
    // Segunda feita, terça perdida, quarta feita.
    const s = sequenciaDeDias(["2026-11-09", "2026-11-11"], "2026-11-11");
    expect(s).toMatchObject({ atual: 2, folgaUsada: true });
  });

  it("o segundo dia útil perdido na mesma semana zera", () => {
    // Segunda feita, terça e quarta perdidas, quinta feita.
    expect(sequenciaDeDias(["2026-11-09", "2026-11-12"], "2026-11-12")).toMatchObject({ atual: 1, maior: 1 });
  });

  it("a folga é uma por semana: semanas diferentes perdoam um dia cada", () => {
    // Sexta 06 perdida (semana de 02), terça 10 perdida (semana de 09).
    const feitos = ["2026-11-04", "2026-11-05", "2026-11-09", "2026-11-11"];
    expect(sequenciaDeDias(feitos, "2026-11-11").atual).toBe(4);
  });

  it("a maior sequência fica mesmo depois de zerar", () => {
    const feitos = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-12"];
    const s = sequenciaDeDias(feitos, "2026-11-12");
    expect(s.maior).toBe(5);
    expect(s.atual).toBe(1);
  });

  it("dia repetido conta uma vez e dia futuro é ignorado", () => {
    expect(sequenciaDeDias(["2026-11-10", "2026-11-10", "2026-11-11", "2026-11-12"], "2026-11-11")).toMatchObject({ atual: 2, feitoHoje: true });
  });
});

describe("segundaDaSemana e indiceDoDesafio", () => {
  it("a semana começa na segunda", () => {
    expect(segundaDaSemana("2026-11-11")).toBe("2026-11-09");
    expect(segundaDaSemana("2026-11-08")).toBe("2026-11-02");
    expect(segundaDaSemana("2026-11-09")).toBe("2026-11-09");
  });

  it("o mesmo dia dá o mesmo texto, dentro do banco", () => {
    for (const dia of ["2026-11-11", "2026-12-31", "2027-01-01"]) {
      const i = indiceDoDesafio(dia, 7);
      expect(i).toBe(indiceDoDesafio(dia, 7));
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(7);
    }
    expect(indiceDoDesafio("2026-11-11", 0)).toBe(0);
  });

  it("dias seguidos não ficam todos no mesmo texto", () => {
    const indices = new Set(Array.from({ length: 10 }, (_, i) => indiceDoDesafio(`2026-11-${String(i + 1).padStart(2, "0")}`, 5)));
    expect(indices.size).toBeGreaterThan(1);
  });
});
