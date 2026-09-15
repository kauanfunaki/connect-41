import { describe, it, expect } from "vitest";
import { fluxoRealizado, projecaoPorJanela, abertosPorMes, consolidarPorEmpresa } from "./fluxo";
import { faixasDeAtraso, faixaDoAtraso, rankingDeContrapartes, type ContaParaAnalise } from "./analise";

const HOJE = "2026-09-15";

describe("fluxoRealizado", () => {
  it("separa entradas e saídas por mês e acumula na janela", () => {
    const r = fluxoRealizado(
      [
        { competenciaDeCaixa: "2026-08", kind: "RECEBER", centavos: 10_000 },
        { competenciaDeCaixa: "2026-08", kind: "PAGAR", centavos: 4_000 },
        { competenciaDeCaixa: "2026-09", kind: "PAGAR", centavos: 7_000 },
        // Fora da janela: ignorado, não somado no mês mais próximo.
        { competenciaDeCaixa: "2026-01", kind: "RECEBER", centavos: 999_999 },
      ],
      ["2026-08", "2026-09"]
    );
    expect(r.map((m) => [m.entradas, m.saidas, m.saldoDoMes, m.saldoAcumulado])).toEqual([
      [10_000, 4_000, 6_000, 6_000],
      [0, 7_000, -7_000, -1_000],
    ]);
    expect(r[0]!.rotulo).toBe("Ago/26");
  });
});

describe("projecaoPorJanela", () => {
  it("acumula por janela a partir de hoje e deixa o vencido de fora", () => {
    const p = projecaoPorJanela(
      [
        { kind: "RECEBER", centavos: 1_000, vencimentoKey: HOJE },
        { kind: "PAGAR", centavos: 300, vencimentoKey: "2026-09-25" },
        { kind: "RECEBER", centavos: 5_000, vencimentoKey: "2026-11-01" },
        { kind: "RECEBER", centavos: 8_000, vencimentoKey: "2026-08-01" },
      ],
      HOJE,
      [7, 30, 60]
    );
    expect(p.vencidos).toEqual({ entradas: 8_000, saidas: 0 });
    expect(p.janelas).toEqual([
      { dias: 7, entradas: 1_000, saidas: 0, saldo: 1_000 },
      { dias: 30, entradas: 1_000, saidas: 300, saldo: 700 },
      { dias: 60, entradas: 6_000, saidas: 300, saldo: 5_700 },
    ]);
  });

  it("abertos por mês de vencimento, com sinal", () => {
    const m = abertosPorMes(
      [
        { kind: "RECEBER", centavos: 1_000, vencimentoKey: "2026-10-05" },
        { kind: "PAGAR", centavos: 400, vencimentoKey: "2026-10-20" },
      ],
      ["2026-10", "2026-11"]
    );
    expect([...m.entries()]).toEqual([["2026-10", 600], ["2026-11", 0]]);
  });
});

describe("consolidarPorEmpresa", () => {
  it("uma linha por empresa, vencidas primeiro", () => {
    const r = consolidarPorEmpresa(
      [
        { companyId: "a", kind: "PAGAR", centavos: 500 },
        { companyId: "a", kind: "RECEBER", centavos: 2_000 },
        { companyId: "b", kind: "RECEBER", centavos: 100 },
      ],
      [{ companyId: "b", kind: "PAGAR", quantidade: 2 }]
    );
    expect(r.map((l) => l.companyId)).toEqual(["b", "a"]);
    expect(r[1]).toEqual({ companyId: "a", pago: 500, recebido: 2_000, saldo: 1_500, vencidasPagar: 0, vencidasReceber: 0 });
  });
});

describe("análise de contas", () => {
  const contas: ContaParaAnalise[] = [
    { situacao: "A_VENCER", valorCentavos: 100, vencimentoKey: "2026-09-20", contraparteNome: "A" },
    { situacao: "VENCE_HOJE", valorCentavos: 200, vencimentoKey: HOJE, contraparteNome: "B" },
    { situacao: "VENCIDA", valorCentavos: 300, vencimentoKey: "2026-09-01", contraparteNome: "A" },
    { situacao: "VENCIDA", valorCentavos: 400, vencimentoKey: "2026-05-01", contraparteNome: "C" },
    // Paga fica fora de faixa e de ranking.
    { situacao: "PAGA", valorCentavos: 9_999, vencimentoKey: "2026-01-01", contraparteNome: "C" },
  ];

  it("vence hoje ainda é a vencer", () => {
    expect(faixaDoAtraso(HOJE, HOJE)).toBe("a_vencer");
    expect(faixaDoAtraso("2026-09-14", HOJE)).toBe("d1_15");
    expect(faixaDoAtraso("2026-06-01", HOJE)).toBe("acima_90");
  });

  it("a soma das faixas bate com o em aberto", () => {
    const f = faixasDeAtraso(contas, HOJE);
    expect(f.reduce((n, x) => n + x.centavos, 0)).toBe(1_000);
    expect(f.find((x) => x.chave === "a_vencer")).toMatchObject({ centavos: 300, quantidade: 2 });
    expect(f.find((x) => x.chave === "d1_15")).toMatchObject({ centavos: 300 });
    expect(f.find((x) => x.chave === "acima_90")).toMatchObject({ centavos: 400 });
  });

  it("ranking por contraparte com participação e vencido", () => {
    const r = rankingDeContrapartes(contas);
    expect(r.map((p) => p.contraparteNome)).toEqual(["A", "C", "B"]);
    expect(r[0]).toMatchObject({ emAberto: 400, vencido: 300, quantidade: 2, participacao: 0.4 });
  });
});
