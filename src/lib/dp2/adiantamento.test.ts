import { describe, expect, it } from "vitest";
import { adiantamentoDoMes, lerParametrosDoAdiantamento } from "./adiantamento";

describe("adiantamento salarial", () => {
  it("lê percentual e dia; vazio desliga", () => {
    expect(lerParametrosDoAdiantamento("40", "15")).toEqual({ ok: true, parametros: { percentual: 40, dia: 15 } });
    expect(lerParametrosDoAdiantamento("", "")).toEqual({ ok: true, parametros: null });
    expect(lerParametrosDoAdiantamento("70", "15")).toMatchObject({ ok: false });
    expect(lerParametrosDoAdiantamento("40", "31")).toMatchObject({ ok: false, erro: expect.stringMatching(/dia/) });
  });

  it("40% do salário; fora quem entrou depois do dia, quem já tem e quem saiu", () => {
    const base = { admissao: "2024-01-10", desligamento: null, jaTemAdiantamento: false };
    const r = adiantamentoDoMes(
      [
        { personId: "a", nome: "Ana", salarioMensal: 3000, ...base },
        { personId: "b", nome: "Bia", salarioMensal: 2000, ...base, admissao: "2027-06-20" },
        { personId: "c", nome: "Caio", salarioMensal: 2500, ...base, jaTemAdiantamento: true },
        { personId: "d", nome: "Davi", salarioMensal: 1800, ...base, desligamento: "2027-06-10" },
      ],
      { percentual: 40, dia: 15 },
      2027,
      6
    );
    expect(r.map((x) => [x.nome, x.valor, x.fora])).toEqual([
      ["Ana", 1200, null],
      ["Bia", 0, "admitido depois do dia 15"],
      ["Caio", 0, "já tem adiantamento lançado no mês"],
      ["Davi", 0, "desligado"],
    ]);
  });
});
