import { describe, it, expect } from "vitest";
import { saldoAtualDaConta, consolidarSaldos, runwayEmDias, type ContaParaConsolidar } from "./saldoConsolidado";

describe("saldoAtualDaConta", () => {
  it("com saldo inicial usa o calculado, até a última movimentação ou o saldo do banco", () => {
    const s = saldoAtualDaConta(
      { tipo: "conferido", calculadoNaDataCentavos: 900, calculadoCentavos: 1_200, bancoCentavos: 900, bancoDataKey: "2026-09-10", divergenciaCentavos: 0 },
      "2026-09-14"
    );
    expect(s).toEqual({ centavos: 1_200, origem: "calculado", referenciaKey: "2026-09-14", divergenciaCentavos: 0 });
  });

  it("sem saldo inicial usa o saldo do banco, na data dele", () => {
    expect(saldoAtualDaConta({ tipo: "sem_saldo_inicial", bancoCentavos: 500, bancoDataKey: "2026-09-12" }, "2026-09-15")).toEqual({
      centavos: 500,
      origem: "banco",
      referenciaKey: "2026-09-12",
      divergenciaCentavos: null,
    });
  });

  it("sem nada, não há saldo", () => {
    expect(saldoAtualDaConta({ tipo: "sem_dados" }, null).centavos).toBeNull();
  });
});

describe("consolidarSaldos", () => {
  const conta = (id: string, centavos: number | null, referenciaKey: string | null, divergenciaCentavos: number | null = null): ContaParaConsolidar => ({
    id,
    nome: id,
    saldo: { centavos, origem: centavos === null ? null : "calculado", referenciaKey, divergenciaCentavos },
  });

  it("soma as contas com saldo e conta as que ficaram de fora", () => {
    const r = consolidarSaldos([conta("a", 1_000, "2026-09-15"), conta("b", -200, "2026-09-10"), conta("c", null, null)]);
    expect(r.centavos).toBe(800);
    expect(r.contasSemSaldo).toBe(1);
  });

  // O total vale até onde vale a conta mais atrasada.
  it("atualizado até é a data mais antiga entre as que entraram", () => {
    expect(consolidarSaldos([conta("a", 1, "2026-09-15"), conta("b", 1, "2026-08-31")]).atualizadoAteKey).toBe("2026-08-31");
  });

  it("marca as contas que não batem com o banco", () => {
    expect(consolidarSaldos([conta("a", 1, "2026-09-15", 0), conta("b", 1, "2026-09-15", -350)]).contasDivergentes).toBe(1);
  });

  it("sem nenhuma conta com saldo, o total é nulo — não zero", () => {
    expect(consolidarSaldos([conta("a", null, null)]).centavos).toBeNull();
    expect(consolidarSaldos([]).centavos).toBeNull();
  });
});

describe("runwayEmDias", () => {
  it("saldo dividido pelo consumo médio, em dias", () => {
    expect(runwayEmDias(300_000, -100_000)).toBe(90);
  });

  it("sem consumo de caixa não há runway", () => {
    expect(runwayEmDias(300_000, 0)).toBeNull();
    expect(runwayEmDias(300_000, 50_000)).toBeNull();
  });

  it("saldo zerado ou negativo é zero dia", () => {
    expect(runwayEmDias(0, -100_000)).toBe(0);
    expect(runwayEmDias(-5_000, -100_000)).toBe(0);
  });
});
