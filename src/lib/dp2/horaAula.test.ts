import { describe, expect, it } from "vitest";
import { CONVENCAO_DA_CLT, calcularMes, salarioDoProfessor, salarioMensalCheio, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

describe("professor por hora-aula", () => {
  it("aulas × 4,5 × valor + 1/6 de DSR", () => {
    // 20 aulas × 4,5 × 30,00 = 2.700,00; DSR 450,00; total 3.150,00.
    expect(salarioDoProfessor(30, 20)).toEqual({ aulas: 20, base: 2700, dsr: 450, total: 3150 });
  });

  it("o mês do professor vale para o cálculo, as férias, o 13º e a rescisão (salário mensal cheio)", () => {
    const v: VinculoDoMotor = { salarioBase: 30, tipoSalario: "HORA_AULA", aulasSemanais: 20, horasMensais: 90, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false };
    expect(salarioMensalCheio(v)).toBe(3150);
    const t = tabelasDaCompetencia("2026-11");
    if (!t.ok) throw new Error("tabelas");
    const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
    const c = calcularMes({
      ano: 2026, mes: 11, admissao: new Date("2024-01-10T00:00:00Z"), desligamento: null, vinculo: v, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
      convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
    });
    const salario = c.itens.find((i) => i.papel === "SALARIO")!;
    expect(salario.valor).toBe(3150);
    expect(salario.memoria).toContain("20 aulas/semana × 4,5 × 30,00 = 2.700,00 + 1/6 de DSR 450,00 = 3.150,00");
  });
});
