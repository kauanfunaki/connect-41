import { describe, expect, it } from "vitest";
import { daeDoDomestico } from "./domestico";
import { CONVENCAO_DA_CLT, calcularMes, encargosDoDomestico, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

describe("empregado doméstico", () => {
  it("encargos da LC 150/2015 sobre 2.000,00", () => {
    const e = encargosDoDomestico(2000, 160);
    expect(e).toMatchObject({ inssEmpresa: 160, rat: 16, terceiros: 0, fgts: 160, indenizacaoCompensatoria: 64, total: 400 });
  });

  it("o cálculo do mês usa os encargos do doméstico na categoria 104", () => {
    const t = tabelasDaCompetencia("2026-11");
    if (!t.ok) throw new Error("tabelas");
    const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
    const vinculo: VinculoDoMotor = { salarioBase: 2000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false, categoria: "104" };
    const c = calcularMes({
      ano: 2026, mes: 11, admissao: new Date("2024-01-10T00:00:00Z"), desligamento: null, vinculo, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
      convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
    });
    expect(c.encargos).toMatchObject({ inssEmpresa: 160, rat: 16, terceiros: 0, indenizacaoCompensatoria: 64 });
    const dae = daeDoDomestico([{ nome: "Maria", inss: c.inss.valor, irrf: c.irrf.valor, fgts: c.fgts, encargos: c.encargos }]);
    expect(dae.total).toBeCloseTo(c.inss.valor + 160 + 16 + c.fgts + 64 + c.irrf.valor, 2);
    expect(dae.linhas.map((l) => l.rotulo)).toContain("Indenização compensatória (3,2%)");
  });
});
