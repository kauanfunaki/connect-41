import { describe, expect, it } from "vitest";
import { faixaDoTempo, lerNivel, mesesDeCasa, salarioDaFaixa } from "./niveis";

describe("níveis salariais", () => {
  it("lê as faixas uma por linha e ordena pelo tempo de casa", () => {
    const r = lerNivel({ nome: "Operacional", faixas: "A; 2; 12; 2.700,00\nA; 1; 0; 2.500,00\n\nB; 1; 36; 3.100" });
    expect(r).toEqual({
      ok: true,
      nivel: {
        nome: "Operacional",
        faixas: [
          { classe: "A", referencia: "1", meses: 0, valor: 2500 },
          { classe: "A", referencia: "2", meses: 12, valor: 2700 },
          { classe: "B", referencia: "1", meses: 36, valor: 3100 },
        ],
      },
    });
    expect(lerNivel({ nome: "X", faixas: "A;1;0" })).toMatchObject({ ok: false, erro: expect.stringMatching(/Linha 1/) });
    expect(lerNivel({ nome: "X", faixas: "A;1;0;100\nA;2;0;200" })).toMatchObject({ ok: false, erro: expect.stringMatching(/mesmo tempo/) });
    expect(lerNivel({ nome: "", faixas: "A;1;0;100" })).toMatchObject({ ok: false });
  });

  it("a faixa é a do tempo de casa alcançado", () => {
    const faixas = [
      { classe: "A", referencia: "1", meses: 0, valor: 2500 },
      { classe: "A", referencia: "2", meses: 12, valor: 2700 },
    ];
    expect(mesesDeCasa("2026-03-15", "2027-03-14")).toBe(11);
    expect(mesesDeCasa("2026-03-15", "2027-03-15")).toBe(12);
    expect(faixaDoTempo(faixas, 11)?.valor).toBe(2500);
    expect(faixaDoTempo(faixas, 12)?.valor).toBe(2700);
    expect(faixaDoTempo([{ classe: "A", referencia: "1", meses: 6, valor: 1 }], 2)).toBeNull();
  });

  it("no horista, o valor da faixa vira a hora", () => {
    const f = { classe: "A", referencia: "1", meses: 0, valor: 2200 };
    expect(salarioDaFaixa(f, { tipoSalario: "MENSAL", horasMensais: 220 })).toBe(2200);
    expect(salarioDaFaixa(f, { tipoSalario: "HORISTA", horasMensais: 220 })).toBe(10);
  });
});
