import { describe, expect, it } from "vitest";
import { apurarCompetencia, lerInformacao, type CalculoParaApurar } from "./apuracao";

const pessoa = (p: Partial<CalculoParaApurar> & { salarioFamilia?: number } = {}): CalculoParaApurar => ({
  proventos: p.proventos ?? 3000,
  inss: p.inss ?? 250,
  irrf: p.irrf ?? 40,
  encargos: p.encargos ?? { inssEmpresa: 600, rat: 60, terceiros: 174 },
  itens: p.salarioFamilia ? [{ papel: "SALARIO_FAMILIA", tipo: "PROVENTO", valor: p.salarioFamilia }] : [],
});

describe("informações da apuração (funcionalidade-769, parte 2)", () => {
  it("retenção pede CNPJ do tomador e nota; compensação pede o período de origem", () => {
    expect(lerInformacao({ tipo: "RETENCAO_INSS", valor: "1.100,00", documento: "11.222.333/0001-81", referencia: "NF 123" })).toEqual({
      ok: true,
      info: { tipo: "RETENCAO_INSS", valor: 1100, documento: "11222333000181", referencia: "NF 123", observacao: null },
    });
    expect(lerInformacao({ tipo: "RETENCAO_INSS", valor: "10", documento: "123", referencia: "1" }).ok).toBe(false);
    expect(lerInformacao({ tipo: "RETENCAO_INSS", valor: "10", documento: "11222333000181" }).ok).toBe(false);
    expect(lerInformacao({ tipo: "COMPENSACAO_IRRF", valor: "50", referencia: "2026-10" })).toEqual({
      ok: true,
      info: { tipo: "COMPENSACAO_IRRF", valor: 50, documento: null, referencia: "2026-10", observacao: null },
    });
    expect(lerInformacao({ tipo: "COMPENSACAO_INSS", valor: "50", referencia: "10/2026" }).ok).toBe(false);
    expect(lerInformacao({ tipo: "OUTRA", valor: "50" }).ok).toBe(false);
    expect(lerInformacao({ tipo: "COMPENSACAO_PIS", valor: "0", referencia: "2026-10" }).ok).toBe(false);
  });
});

describe("apuração da competência (funcionalidade-769, parte 2)", () => {
  it("sem informações: CP = segurados + patronal + RAT, menos o salário-família; terceiros à parte", () => {
    const a = apurarCompetencia({ calculos: [pessoa(), pessoa({ salarioFamilia: 65 })], informacoes: [], pisSobreFolha: false });
    expect(a.segurados).toBe(500);
    expect(a.cpDevida).toBe(500 + 1200 + 120);
    expect(a.salarioFamilia).toBe(65);
    expect(a.cpARecolher).toBe(1820 - 65);
    expect(a.terceiros).toBe(348);
    expect(a.inssARecolher).toBe(1755 + 348);
    expect(a.irrfARecolher).toBe(80);
    expect(a.pisARecolher).toBe(0);
    expect(a.saldoCp).toBe(0);
  });

  it("retenções e compensações abatem só a CP, nunca os terceiros, e o que sobra vira saldo", () => {
    const a = apurarCompetencia({
      calculos: [pessoa()],
      informacoes: [
        { tipo: "RETENCAO_INSS", valor: 700 },
        { tipo: "COMPENSACAO_INSS", valor: 300 },
      ],
      pisSobreFolha: false,
    });
    // CP 910; deduções 1.000 → usa 910, saldo 90; terceiros 174 continuam.
    expect(a.cpDevida).toBe(910);
    expect(a.deducoesUsadas).toBe(910);
    expect(a.cpARecolher).toBe(0);
    expect(a.saldoCp).toBe(90);
    expect(a.inssARecolher).toBe(174);
    expect(a.memoria.join(" ")).toContain("fica saldo de 90,00");
  });

  it("IRRF e PIS sobre a folha com compensações", () => {
    const a = apurarCompetencia({
      calculos: [pessoa({ salarioFamilia: 65, proventos: 3065 }), pessoa()],
      informacoes: [
        { tipo: "COMPENSACAO_IRRF", valor: 100 },
        { tipo: "COMPENSACAO_PIS", valor: 10 },
      ],
      pisSobreFolha: true,
    });
    expect(a.irrfARecolher).toBe(0);
    expect(a.saldoIrrf).toBe(20);
    // Folha sem o salário-família: 3.000 + 3.000 → PIS 60,00 − 10,00.
    expect(a.basePis).toBe(6000);
    expect(a.pisDevido).toBe(60);
    expect(a.pisARecolher).toBe(50);
  });

  it("PIS sobre a folha só sobre os empregados: estagiário e sócio ficam fora da base", () => {
    const a = apurarCompetencia({ calculos: [pessoa(), { ...pessoa({ proventos: 1500 }), empregado: false }], informacoes: [], pisSobreFolha: true });
    expect(a.basePis).toBe(3000);
  });

  it("sem a opção da empresa, não há PIS sobre a folha", () => {
    const a = apurarCompetencia({ calculos: [pessoa()], informacoes: [{ tipo: "COMPENSACAO_PIS", valor: 10 }], pisSobreFolha: false });
    expect(a.pisDevido).toBe(0);
    expect(a.saldoPis).toBe(10);
  });
});
