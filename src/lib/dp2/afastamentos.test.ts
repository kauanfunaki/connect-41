import { describe, expect, it } from "vitest";
import { afastamentosDosXml, afastamentosNoMes, diasPeloInss } from "./afastamentos";
import { CONVENCAO_DA_CLT, calcularMes, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

describe("afastamentosDosXml", () => {
  it("lê início, motivo e fim e junta o fim informado depois", () => {
    const a = "<iniAfastamento><dtIniAfast>2027-03-10</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento>";
    const b = "<iniAfastamento><dtIniAfast>2027-03-10</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento><fimAfastamento><dtTermAfast>2027-04-20</dtTermAfast></fimAfastamento>";
    expect(afastamentosDosXml([a, b, "<x/>"])).toEqual([{ motivo: "03", inicio: "2027-03-10", fim: "2027-04-20" }]);
  });
});

describe("afastamentosNoMes", () => {
  const doenca = { motivo: "03", inicio: "2027-03-10", fim: "2027-04-20" };

  it("doença: 15 dias da empresa, o resto pelo INSS", () => {
    const [m] = afastamentosNoMes([doenca], 2027, 3);
    // 10 a 31 de março = 22 dias; 10 a 24 são da empresa (15), 25 a 31 do INSS (7).
    expect(m).toMatchObject({ diasEmpresa: 15, diasInss: 7, mesInteiro: false, alerta: null });
    const [abr] = afastamentosNoMes([doenca], 2027, 4);
    expect(abr).toMatchObject({ diasEmpresa: 0, diasInss: 20 });
  });

  it("afastado o mês inteiro pelo INSS tira os 30 dias, mesmo em fevereiro", () => {
    const longo = afastamentosNoMes([{ motivo: "03", inicio: "2027-01-01", fim: null }], 2027, 2);
    expect(longo[0]).toMatchObject({ diasInss: 28, mesInteiro: true });
    expect(diasPeloInss(longo)).toBe(30);
    expect(diasPeloInss(afastamentosNoMes([doenca], 2027, 3))).toBe(7);
  });

  it("acidente do trabalho avisa do FGTS; maternidade avisa da dedução; outro motivo pede conferência", () => {
    expect(afastamentosNoMes([{ motivo: "01", inicio: "2027-03-01", fim: null }], 2027, 3)[0].alerta).toMatch(/FGTS/);
    expect(afastamentosNoMes([{ motivo: "01", inicio: "2027-03-20", fim: null }], 2027, 3)[0].alerta).toBeNull();
    const mat = afastamentosNoMes([{ motivo: "17", inicio: "2027-03-01", fim: "2027-06-28" }], 2027, 3)[0];
    expect(mat).toMatchObject({ diasMaternidade: 31, diasInss: 0 });
    expect(mat.alerta).toMatch(/DCTFWeb/);
    expect(afastamentosNoMes([{ motivo: "21", inicio: "2027-03-01", fim: "2027-03-05" }], 2027, 3)[0].alerta).toMatch(/Confira/);
  });

  it("fora do mês não entra", () => {
    expect(afastamentosNoMes([doenca], 2027, 5)).toEqual([]);
    expect(afastamentosNoMes([doenca], 2027, 2)).toEqual([]);
  });
});

describe("afastamento na folha do mês", () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  const t = tabelasDaCompetencia("2026-11");
  if (!t.ok) throw new Error("tabelas");
  const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
  const vinculo: VinculoDoMotor = { salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false };
  const base = {
    ano: 2026, mes: 11, admissao: d("2024-03-10"), desligamento: null, vinculo, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
    convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
  };
  const salario = (c: ReturnType<typeof calcularMes>) => c.itens.find((i) => i.papel === "SALARIO")!;

  it("doença: o salário paga os 15 dias da empresa e tira os do INSS", () => {
    // 01/11 a 30/11: 15 dias da empresa, 15 do INSS.
    const c = calcularMes({ ...base, afastamentos: afastamentosNoMes([{ motivo: "03", inicio: "2026-11-01", fim: "2026-11-30" }], 2026, 11) });
    expect(salario(c).valor).toBe(1500);
    expect(salario(c).memoria).toContain("15 dia(s) de afastamento pagos pelo INSS");
  });

  it("o mês inteiro pelo INSS zera o salário; maternidade mantém e avisa", () => {
    const inss = calcularMes({ ...base, afastamentos: afastamentosNoMes([{ motivo: "03", inicio: "2026-09-01", fim: null }], 2026, 11) });
    expect(salario(inss).valor).toBe(0);
    const mat = calcularMes({ ...base, afastamentos: afastamentosNoMes([{ motivo: "17", inicio: "2026-10-01", fim: null }], 2026, 11) });
    expect(salario(mat).valor).toBe(3000);
    expect(mat.alertas.join(" ")).toMatch(/salário-maternidade/);
  });
});
