import { describe, expect, it } from "vitest";
import {
  descricaoDaRegra,
  diasCorridos,
  encargosDaBaixa,
  lerRegraDoFormulario,
  percentualDeTexto,
  regraDasColunas,
  regraNoCampo,
  regraQueVale,
  textoDoPercentual,
  type RegraDeEncargos,
} from "./encargos";

// 2% de multa, 1% ao mês de juros, 5% de desconto até o vencimento.
const regra: RegraDeEncargos = { multa: 20_000, jurosAoMes: 10_000, desconto: 50_000 };
const colunas = (multa: string | null, juros: string | null, desconto: string | null) => ({
  lateFinePercent: multa,
  lateInterestPercent: juros,
  earlyDiscountPercent: desconto,
});

describe("dias corridos", () => {
  it("conta pelo calendário, atravessando mês, ano e fevereiro", () => {
    expect(diasCorridos("2026-10-10", "2026-10-10")).toBe(0);
    expect(diasCorridos("2026-10-10", "2026-10-11")).toBe(1);
    expect(diasCorridos("2026-10-31", "2026-11-01")).toBe(1);
    expect(diasCorridos("2026-12-31", "2027-01-01")).toBe(1);
    expect(diasCorridos("2028-02-28", "2028-03-01")).toBe(2); // bissexto
    expect(diasCorridos("2026-10-10", "2026-10-05")).toBe(-5);
  });

  it("não se confunde com o horário de verão (dia a dia, sem fuso)", () => {
    expect(diasCorridos("2026-10-01", "2026-11-30")).toBe(60);
  });
});

describe("juros, multa e desconto da baixa", () => {
  it("pago no vencimento: sem juros nem multa, com o desconto", () => {
    expect(encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-10", pagamentoKey: "2026-10-10" }, regra)).toEqual({
      diasDeAtraso: 0,
      jurosCentavos: 0,
      multaCentavos: 0,
      descontoCentavos: 5_000,
    });
  });

  it("pago antes do vencimento: o desconto também", () => {
    const r = encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-10", pagamentoKey: "2026-10-01" }, regra);
    expect(r.descontoCentavos).toBe(5_000);
    expect(r.jurosCentavos + r.multaCentavos).toBe(0);
  });

  it("um dia de atraso: multa cheia e 1/30 dos juros do mês, sem desconto", () => {
    // R$ 1.000: multa R$ 20,00; juros 1% a.m. / 30 = R$ 0,3333… → R$ 0,33.
    expect(encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-10", pagamentoKey: "2026-10-11" }, regra)).toEqual({
      diasDeAtraso: 1,
      jurosCentavos: 33,
      multaCentavos: 2_000,
      descontoCentavos: 0,
    });
  });

  it("10 dias de atraso: juros simples pro rata (R$ 3,33)", () => {
    const r = encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-10", pagamentoKey: "2026-10-20" }, regra);
    expect(r).toMatchObject({ diasDeAtraso: 10, jurosCentavos: 333, multaCentavos: 2_000 });
  });

  it("juros simples, não compostos: 60 dias são 2% exatos", () => {
    const r = encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-01", pagamentoKey: "2026-11-30" }, regra);
    expect(r.jurosCentavos).toBe(2_000);
  });

  it("arredonda ao centavo, meio para cima", () => {
    // R$ 0,25 × 2% = 0,5 centavo → 1 centavo; R$ 0,24 × 2% = 0,48 → 0.
    expect(encargosDaBaixa({ principalCentavos: 25, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-02" }, { multa: 20_000, jurosAoMes: 0, desconto: 0 }).multaCentavos).toBe(1);
    expect(encargosDaBaixa({ principalCentavos: 24, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-02" }, { multa: 20_000, jurosAoMes: 0, desconto: 0 }).multaCentavos).toBe(0);
    // R$ 1.234,56 × 0,0333% ao mês × 45 dias / 30 = 0,6166… centavo… → 62 centavos.
    const r = encargosDaBaixa({ principalCentavos: 123_456, vencimentoKey: "2026-10-01", pagamentoKey: "2026-11-15" }, { multa: 0, jurosAoMes: 333, desconto: 0 });
    expect(r.jurosCentavos).toBe(Math.round((123_456 * 0.0333) / 100 * 45 / 30));
  });

  it("valores grandes não perdem precisão", () => {
    const r = encargosDaBaixa({ principalCentavos: 99_999_999_999, vencimentoKey: "2020-01-01", pagamentoKey: "2026-01-01" }, { multa: 1_000_000, jurosAoMes: 1_000_000, desconto: 0 });
    expect(r.multaCentavos).toBe(99_999_999_999);
    expect(r.diasDeAtraso).toBe(2192);
    expect(r.jurosCentavos).toBe(Math.round((99_999_999_999 * 2192) / 30));
  });

  it("sem regra, ou sem valor, tudo zero — como antes", () => {
    const zero = { diasDeAtraso: 0, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0 };
    expect(encargosDaBaixa({ principalCentavos: 100_000, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-20" }, null)).toEqual(zero);
    expect(encargosDaBaixa({ principalCentavos: 0, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-20" }, regra)).toEqual(zero);
  });

  it("regra só com juros: atraso dá juros e nenhuma multa; em dia, nenhum desconto", () => {
    const soJuros = { multa: 0, jurosAoMes: 30_000, desconto: 0 };
    expect(encargosDaBaixa({ principalCentavos: 30_000, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-02" }, soJuros)).toMatchObject({ jurosCentavos: 30, multaCentavos: 0 });
    expect(encargosDaBaixa({ principalCentavos: 30_000, vencimentoKey: "2026-10-01", pagamentoKey: "2026-10-01" }, soJuros).descontoCentavos).toBe(0);
  });
});

describe("a regra que vale", () => {
  it("colunas todas nulas: sem regra; uma preenchida: as outras valem zero", () => {
    expect(regraDasColunas(colunas(null, null, null))).toBeNull();
    expect(regraDasColunas(null)).toBeNull();
    expect(regraDasColunas(colunas("2.0000", null, null))).toEqual({ multa: 20_000, jurosAoMes: 0, desconto: 0 });
    expect(regraDasColunas(colunas("2.5000", "0.0330", "10.0000"))).toEqual({ multa: 25_000, jurosAoMes: 330, desconto: 100_000 });
  });

  it("a do fornecedor ou cliente passa por cima da empresa, inteira", () => {
    const empresa = colunas("2", "1", "5");
    expect(regraQueVale(empresa, colunas(null, null, null))).toEqual({ multa: 20_000, jurosAoMes: 10_000, desconto: 50_000, origem: "empresa" });
    // A contraparte que zera a multa não herda os juros da empresa.
    expect(regraQueVale(empresa, colunas("0", null, null))).toEqual({ multa: 0, jurosAoMes: 0, desconto: 0, origem: "contraparte" });
    expect(regraQueVale(null, colunas("1", "2", null))).toMatchObject({ origem: "contraparte", multa: 10_000, jurosAoMes: 20_000 });
    expect(regraQueVale(colunas(null, null, null), null)).toBeNull();
  });
});

describe("percentual no formulário", () => {
  it("lê vírgula, ponto, % e espaços; vazio é nulo", () => {
    expect(percentualDeTexto("2")).toBe(20_000);
    expect(percentualDeTexto("2,5")).toBe(25_000);
    expect(percentualDeTexto(" 1.5 % ")).toBe(15_000);
    expect(percentualDeTexto("0,0333")).toBe(333);
    expect(percentualDeTexto("100")).toBe(1_000_000);
    expect(percentualDeTexto("")).toBeNull();
    expect(percentualDeTexto(null)).toBeNull();
  });

  it("recusa negativo, texto, mais de quatro casas e acima de 100%", () => {
    for (const t of ["-1", "abc", "1,23456", "100,01", "1,2,3"]) expect(percentualDeTexto(t)).toBeUndefined();
  });

  it("mostra sem zeros sobrando", () => {
    expect(textoDoPercentual(20_000)).toBe("2");
    expect(textoDoPercentual(25_000)).toBe("2,5");
    expect(textoDoPercentual(333)).toBe("0,0333");
    expect(regraNoCampo(colunas("2.5000", null, "0.0000"))).toEqual({ multa: "2,5", juros: "", desconto: "0" });
  });

  it("lê os três campos para as colunas, e diz qual está errado", () => {
    const campos = (m: string, j: string, d: string) => (n: "multa" | "juros" | "desconto") => ({ multa: m, juros: j, desconto: d })[n];
    expect(lerRegraDoFormulario(campos("2", "1,5", ""))).toEqual({
      ok: true,
      dados: { lateFinePercent: "2.0000", lateInterestPercent: "1.5000", earlyDiscountPercent: null },
    });
    expect(lerRegraDoFormulario(campos("", "", ""))).toEqual({ ok: true, dados: { lateFinePercent: null, lateInterestPercent: null, earlyDiscountPercent: null } });
    expect(lerRegraDoFormulario(campos("x", "", ""))).toMatchObject({ ok: false, erro: expect.stringContaining("Multa") });
    expect(lerRegraDoFormulario(campos("", "200", ""))).toMatchObject({ ok: false, erro: expect.stringContaining("Juros") });
    expect(lerRegraDoFormulario(campos("", "", "-5"))).toMatchObject({ ok: false, erro: expect.stringContaining("Desconto") });
  });

  it("descreve a regra", () => {
    expect(descricaoDaRegra(regra)).toBe("Multa de 2% · juros de 1% ao mês · desconto de 5% até o vencimento");
    expect(descricaoDaRegra({ multa: 0, jurosAoMes: 333, desconto: 0 })).toBe("Juros de 0,0333% ao mês");
    expect(descricaoDaRegra({ multa: 0, jurosAoMes: 0, desconto: 0 })).toBe("Sem juros, multa nem desconto");
  });
});
