import { describe, expect, it } from "vitest";
import { relatorioDeTransparencia, salarioMensalDoContrato } from "./transparenciaSalarial";

describe("transparência salarial", () => {
  it("horista vira mês pelas horas", () => {
    expect(salarioMensalDoContrato({ salarioBase: 10, tipoSalario: "HORISTA", horasMensais: 220 })).toBe(2200);
    expect(salarioMensalDoContrato({ salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220 })).toBe(3000);
  });

  it("por cargo: quantas mulheres e homens, as médias e a razão", () => {
    const r = relatorioDeTransparencia(
      [
        { cargo: "Padeiro", sexo: "F", racaCor: "1", salarioMensal: 2700 },
        { cargo: "Padeiro", sexo: "M", racaCor: "3", salarioMensal: 3000 },
        { cargo: "Padeiro", sexo: "M", racaCor: "1", salarioMensal: 3000 },
        { cargo: "Caixa", sexo: "F", racaCor: null, salarioMensal: 2000 },
        { cargo: null, sexo: null, racaCor: null, salarioMensal: 5000 },
      ],
      (c) => ({ "1": "Branca", "3": "Parda" })[c] ?? c
    );
    expect(r).toMatchObject({ empregados: 5, obrigada: false, semSexo: 1 });
    expect(r.porCargo).toEqual([
      { cargo: "Caixa", mulheres: 1, homens: 0, mediaMulheres: 2000, mediaHomens: null, razao: null },
      { cargo: "Padeiro", mulheres: 1, homens: 2, mediaMulheres: 2700, mediaHomens: 3000, razao: 90 },
    ]);
    expect(r.porRaca[0]).toEqual({ racaCor: "Branca", pessoas: 2, media: 2850 });
    expect(r.geral).toEqual({ mediaMulheres: 2350, mediaHomens: 3000, razao: 78.33 });
  });

  it("100 ou mais empregados é obrigada", () => {
    const pessoas = Array.from({ length: 100 }, (_, i) => ({ cargo: "X", sexo: i % 2 ? "F" : "M", racaCor: null, salarioMensal: 1000 }));
    expect(relatorioDeTransparencia(pessoas).obrigada).toBe(true);
  });
});
