import { describe, expect, it } from "vitest";
import { lerReajuste, preverReajuste, salarioReajustado, salarioNoMes } from "./reajuste";

describe("reajuste coletivo", () => {
  it("lê percentual e piso e recusa o vazio", () => {
    expect(lerReajuste({ percentual: "5,5", piso: "", data: "2027-05-01", motivo: "" })).toEqual({ ok: true, reajuste: { percentual: 5.5, piso: null, data: "2027-05-01", motivo: "Reajuste coletivo" } });
    expect(lerReajuste({ percentual: "", piso: "", data: "2027-05-01", motivo: "" })).toMatchObject({ ok: false });
    expect(lerReajuste({ percentual: "5", piso: "", data: "", motivo: "" })).toMatchObject({ ok: false, erro: expect.stringMatching(/data/) });
  });

  it("percentual e piso: quem fica abaixo do piso sobe para ele", () => {
    const r = { percentual: 5, piso: 2000 };
    expect(salarioReajustado({ salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220 }, r)).toBe(3150);
    expect(salarioReajustado({ salarioBase: 1800, tipoSalario: "MENSAL", horasMensais: 220 }, r)).toBe(2000);
    // Horista: piso 2.200 ÷ 220 h = 10/h.
    expect(salarioReajustado({ salarioBase: 9, tipoSalario: "HORISTA", horasMensais: 220 }, { percentual: 0, piso: 2200 })).toBe(10);
  });

  it("prevê quem muda e por quê", () => {
    const p = preverReajuste(
      [
        { personId: "a", nome: "A", salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220 },
        { personId: "b", nome: "B", salarioBase: 1800, tipoSalario: "MENSAL", horasMensais: 220 },
        { personId: "c", nome: "C", salarioBase: 2500, tipoSalario: "MENSAL", horasMensais: 220 },
      ],
      { percentual: 0, piso: 2000 }
    );
    expect(p.map((x) => [x.personId, x.depois, x.pelo])).toEqual([
      ["a", 3000, "SEM_MUDANCA"],
      ["b", 2000, "PISO"],
      ["c", 2500, "SEM_MUDANCA"],
    ]);
  });
});

describe("salário vigente no mês", () => {
  const h = [
    { data: "2027-03-01", salario: 3300, salarioAnterior: 3000 },
    { data: "2027-07-15", salario: 3600, salarioAnterior: 3300 },
  ];
  it("vale a última mudança até o fim do mês", () => {
    expect(salarioNoMes(h, "2027-02-28", 3600)).toBe(3000);
    expect(salarioNoMes(h, "2027-03-31", 3600)).toBe(3300);
    expect(salarioNoMes(h, "2027-06-30", 3600)).toBe(3300);
    expect(salarioNoMes(h, "2027-07-31", 3600)).toBe(3600);
  });
  it("sem histórico, vale o contrato", () => {
    expect(salarioNoMes([], "2027-07-31", 2500)).toBe(2500);
    expect(salarioNoMes([{ data: "2027-08-01", salario: 2800, salarioAnterior: null }], "2027-07-31", 2800)).toBe(2800);
  });
});
