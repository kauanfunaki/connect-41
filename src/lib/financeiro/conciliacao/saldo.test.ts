import { describe, expect, it } from "vitest";
import { situacaoDoSaldo, saldoDeReferencia } from "./saldo";

const transacoes = [
  { dataKey: "2026-08-31", centavos: -999_00 }, // antes do saldo inicial: não conta
  { dataKey: "2026-09-01", centavos: -100_00 }, // no dia do saldo inicial: conta
  { dataKey: "2026-09-10", centavos: 250_00 },
  { dataKey: "2026-09-20", centavos: -50_00 }, // depois do saldo do banco
];

describe("situacaoDoSaldo", () => {
  it("confere na data do saldo do banco e aponta divergência zero", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: 1_000_00,
      saldoInicialKey: "2026-09-01",
      transacoes,
      banco: { centavos: 1_150_00, dataKey: "2026-09-15" },
    });
    expect(s).toEqual({
      tipo: "conferido",
      calculadoNaDataCentavos: 1_150_00,
      calculadoCentavos: 1_100_00,
      bancoCentavos: 1_150_00,
      bancoDataKey: "2026-09-15",
      divergenciaCentavos: 0,
    });
  });

  it("falta de extrato aparece como divergência em centavos", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: 1_000_00,
      saldoInicialKey: "2026-09-01",
      transacoes,
      banco: { centavos: 1_149_90, dataKey: "2026-09-15" },
    });
    expect(s).toMatchObject({ tipo: "conferido", divergenciaCentavos: 10 });
  });

  it("transação no próprio dia do saldo do banco entra", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: 0,
      saldoInicialKey: "2026-09-01",
      transacoes,
      banco: { centavos: 100_00, dataKey: "2026-09-20" },
    });
    expect(s).toMatchObject({ tipo: "conferido", calculadoNaDataCentavos: 100_00, divergenciaCentavos: 0 });
  });

  it("sem data no saldo do banco, compara com tudo", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: 0,
      saldoInicialKey: "2026-09-01",
      transacoes,
      banco: { centavos: 100_00, dataKey: null },
    });
    expect(s).toMatchObject({ tipo: "conferido", divergenciaCentavos: 0 });
  });

  it("sem saldo inicial: mostra o do banco, sem conferir", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: null,
      saldoInicialKey: null,
      transacoes,
      banco: { centavos: 500_00, dataKey: "2026-09-15" },
    });
    expect(s).toEqual({ tipo: "sem_saldo_inicial", bancoCentavos: 500_00, bancoDataKey: "2026-09-15" });
  });

  it("sem saldo inicial nem do banco", () => {
    expect(situacaoDoSaldo({ saldoInicialCentavos: null, saldoInicialKey: null, transacoes, banco: null })).toEqual({
      tipo: "sem_dados",
    });
  });

  it("saldo inicial sem importação com saldo", () => {
    const s = situacaoDoSaldo({ saldoInicialCentavos: 10_00, saldoInicialKey: "2026-09-01", transacoes, banco: null });
    expect(s).toEqual({ tipo: "sem_saldo_do_banco", calculadoCentavos: 110_00 });
  });

  it("saldo do banco anterior ao saldo inicial", () => {
    const s = situacaoDoSaldo({
      saldoInicialCentavos: 0,
      saldoInicialKey: "2026-09-01",
      transacoes,
      banco: { centavos: 1, dataKey: "2026-08-31" },
    });
    expect(s.tipo).toBe("banco_anterior_ao_inicial");
  });
});

describe("saldoDeReferencia", () => {
  const em = (d: string) => new Date(`${d}T12:00:00-03:00`);

  it("a de DTASOF mais recente, não a última importada", () => {
    const r = saldoDeReferencia([
      { id: "set", ledgerCentavos: 1, ledgerKey: "2026-09-30", importadoEm: em("2026-10-01") },
      { id: "ago", ledgerCentavos: 2, ledgerKey: "2026-08-31", importadoEm: em("2026-10-02") },
      { id: "sem", ledgerCentavos: null, ledgerKey: null, importadoEm: em("2026-10-03") },
    ]);
    expect(r?.id).toBe("set");
  });

  it("empate desempata pela importação mais nova", () => {
    const r = saldoDeReferencia([
      { id: "a", ledgerCentavos: 1, ledgerKey: "2026-09-30", importadoEm: em("2026-10-01") },
      { id: "b", ledgerCentavos: 2, ledgerKey: "2026-09-30", importadoEm: em("2026-10-02") },
    ]);
    expect(r?.id).toBe("b");
  });

  it("nenhuma com saldo", () => {
    expect(saldoDeReferencia([])).toBeNull();
  });
});
