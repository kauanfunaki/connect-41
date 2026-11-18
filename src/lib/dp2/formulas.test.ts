import { describe, expect, it } from "vitest";
import { calcularExemplos, exemploDaFormula, FORMULAS, rubricasDaFormula, TEMAS } from "./formulas";
import { reais } from "./formato";
import { RUBRICAS_PADRAO } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

function tabelas(competencia: string) {
  const t = tabelasDaCompetencia(competencia);
  if (!t.ok) throw new Error(`faltam tabelas: ${t.faltam.join(", ")}`);
  return t.tabelas;
}

describe("catálogo de fórmulas do DP 2", () => {
  it("tem fórmula para todo papel de rubrica do motor", () => {
    const cobertos = new Set(FORMULAS.flatMap((f) => f.papeis));
    const semFormula = RUBRICAS_PADRAO.filter((r) => r.papel !== null && !cobertos.has(r.papel)).map((r) => r.papel);
    expect(semFormula).toEqual([]);
  });

  it("não repete id e cada fórmula é de um tema da tela", () => {
    const ids = FORMULAS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const temas = new Set(TEMAS.map((t) => t.tema));
    for (const f of FORMULAS) expect(temas.has(f.tema)).toBe(true);
  });

  it.each(["2025-06", "2026-11"])("todo exemplo sai do motor em %s, sem erro", (competencia) => {
    const x = calcularExemplos(competencia, tabelas(competencia));
    for (const f of FORMULAS) {
      const linhas = exemploDaFormula(f, x);
      expect(linhas.length, `exemplo vazio em ${f.id}`).toBeGreaterThan(0);
      expect(linhas.join(" "), `exemplo com erro em ${f.id}`).not.toMatch(/indisponível|undefined|NaN/);
    }
  });

  it("o exemplo mostra a conta do motor, não um texto à parte", () => {
    const x = calcularExemplos("2026-11", tabelas("2026-11"));
    const salario = FORMULAS.find((f) => f.id === "salario")!;
    expect(exemploDaFormula(salario, x)[0]).toContain("3.000,00 (mês cheio)");
    const inss = x.clt.itens.find((i) => i.papel === "INSS")!;
    expect(inss.memoria.endsWith(exemploDaFormula(FORMULAS.find((f) => f.id === "inss")!, x).at(-1)!)).toBe(true);
    expect(x.irrfAlto.valor).toBeGreaterThan(0);
    expect(exemploDaFormula(FORMULAS.find((f) => f.id === "irrf")!, x)).toContain(`IRRF = ${reais(x.irrfAlto.valor)}`);
  });

  it("nomeia as rubricas padrão de cada fórmula", () => {
    expect(rubricasDaFormula(FORMULAS.find((f) => f.id === "hora-extra")!)).toEqual(["002 Horas extras 50%", "003 Horas extras 100%"]);
  });
});
