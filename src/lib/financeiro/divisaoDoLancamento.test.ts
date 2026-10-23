import { describe, expect, it } from "vitest";
import { dividirLancamento } from "./divisaoDoLancamento";
import type { LinhaDoRateio } from "./rateio";

const linha = (categoriaId: string, centavos: number, centroId: string | null = null): LinhaDoRateio => ({
  categoriaId,
  centroId,
  projetoId: null,
  centavos,
});

const soma = (xs: { centavos: number }[]) => xs.reduce((s, x) => s + x.centavos, 0);

describe("dividirLancamento", () => {
  it("sem parcela, retenção nem rateio: uma conta com o bruto", () => {
    const r = dividirLancamento({ brutoCentavos: 100_000, retencoes: [], rateio: [] });
    expect(r).toEqual({
      ok: true,
      contas: [{ indice: 1, brutoCentavos: 100_000, retencoes: [], liquidoCentavos: 100_000, rateio: [], resumo: null }],
    });
  });

  it("rateio com retenção: as linhas digitadas no bruto passam a fechar o líquido", () => {
    // R$ 1.000 de bruto, R$ 15 de IRRF: a conta é de R$ 985, e o rateio 60/40 fecha os R$ 985.
    const r = dividirLancamento({
      brutoCentavos: 100_000,
      retencoes: [{ tributo: "IRRF", centavos: 1_500 }],
      rateio: [linha("aluguel", 60_000, "lojaA"), linha("aluguel", 40_000, "lojaB")],
    });
    if (!r.ok) throw new Error(r.erro);
    const [c] = r.contas;
    expect(c!.liquidoCentavos).toBe(98_500);
    expect(c!.retencoes).toEqual([{ tributo: "IRRF", centavos: 1_500 }]);
    expect(c!.rateio.map((l) => l.centavos)).toEqual([59_100, 39_400]);
    expect(soma(c!.rateio)).toBe(c!.liquidoCentavos);
    expect(c!.resumo).toEqual({ categoriaId: "aluguel", centroId: null, projetoId: null });
  });

  it("rateio com parcelas: cada parcela leva o rateio na proporção dela", () => {
    const r = dividirLancamento({
      brutoCentavos: 100_000,
      parcelas: [
        { indice: 1, centavos: 33_334 },
        { indice: 2, centavos: 33_333 },
        { indice: 3, centavos: 33_333 },
      ],
      retencoes: [],
      rateio: [linha("a", 50_000), linha("b", 50_000)],
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.contas.map((c) => c.liquidoCentavos)).toEqual([33_334, 33_333, 33_333]);
    for (const c of r.contas) expect(soma(c.rateio)).toBe(c.liquidoCentavos);
    expect(r.contas[0]!.rateio.map((l) => l.centavos)).toEqual([16_667, 16_667]);
    expect(r.contas[1]!.rateio.map((l) => l.centavos)).toEqual([16_667, 16_666]);
  });

  it("retenção com parcelas: cada tributo se reparte pelo bruto das parcelas e fecha no centavo", () => {
    const r = dividirLancamento({
      brutoCentavos: 100_000,
      parcelas: [
        { indice: 1, centavos: 33_334 },
        { indice: 2, centavos: 33_333 },
        { indice: 3, centavos: 33_333 },
      ],
      retencoes: [
        { tributo: "IRRF", centavos: 1_500 },
        { tributo: "ISS", centavos: 5_000 },
      ],
      rateio: [],
    });
    if (!r.ok) throw new Error(r.erro);
    const irrf = r.contas.map((c) => c.retencoes.find((x) => x.tributo === "IRRF")!.centavos);
    const iss = r.contas.map((c) => c.retencoes.find((x) => x.tributo === "ISS")!.centavos);
    expect(irrf).toEqual([500, 500, 500]);
    expect(soma(iss.map((centavos) => ({ centavos })))).toBe(5_000);
    expect(iss).toEqual([1_667, 1_667, 1_666]);
    for (const c of r.contas) expect(c.liquidoCentavos).toBe(c.brutoCentavos - soma(c.retencoes));
    expect(soma(r.contas.map((c) => ({ centavos: c.liquidoCentavos })))).toBe(100_000 - 6_500);
  });

  it("os três juntos: cada parcela com as retenções dela e o rateio do líquido dela", () => {
    const r = dividirLancamento({
      brutoCentavos: 120_000,
      parcelas: [
        { indice: 1, centavos: 60_000 },
        { indice: 2, centavos: 60_000 },
      ],
      retencoes: [{ tributo: "INSS", centavos: 13_200 }],
      rateio: [linha("obra", 90_000, "x"), linha("obra", 30_000, "y")],
    });
    if (!r.ok) throw new Error(r.erro);
    for (const c of r.contas) {
      expect(c.retencoes).toEqual([{ tributo: "INSS", centavos: 6_600 }]);
      expect(c.liquidoCentavos).toBe(53_400);
      expect(c.rateio.map((l) => l.centavos)).toEqual([40_050, 13_350]);
    }
  });

  it("tributo pequeno demais para todas as parcelas: a parcela sem centavo fica sem a retenção", () => {
    const r = dividirLancamento({
      brutoCentavos: 300,
      parcelas: [
        { indice: 1, centavos: 100 },
        { indice: 2, centavos: 100 },
        { indice: 3, centavos: 100 },
      ],
      retencoes: [{ tributo: "PIS", centavos: 2 }],
      rateio: [],
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.contas.map((c) => c.retencoes.length)).toEqual([1, 1, 0]);
    expect(r.contas.map((c) => c.liquidoCentavos)).toEqual([99, 99, 100]);
  });

  it("linha do rateio que some numa parcela pequena sai; sobrando uma, a conta não é rateada", () => {
    const r = dividirLancamento({
      brutoCentavos: 1_001,
      parcelas: [
        { indice: 1, centavos: 1_000 },
        { indice: 2, centavos: 1 },
      ],
      retencoes: [],
      rateio: [linha("grande", 1_000), linha("pequena", 1)],
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.contas[1]!.rateio).toEqual([]);
    expect(r.contas[1]!.resumo?.categoriaId).toBe("grande");
  });

  it("recusa quando as retenções não cabem numa parcela", () => {
    const r = dividirLancamento({
      brutoCentavos: 10_000,
      parcelas: [
        { indice: 1, centavos: 9_990 },
        { indice: 2, centavos: 10 },
      ],
      retencoes: [{ tributo: "ISS", centavos: 9_000 }],
      rateio: [],
    });
    // 9.000 × 10/10.000 = 9 centavos na segunda parcela: sobra 1 — cabe.
    expect(r.ok).toBe(true);
    const r2 = dividirLancamento({ brutoCentavos: 1_000, retencoes: [{ tributo: "ISS", centavos: 1_000 }], rateio: [] });
    expect(r2).toMatchObject({ ok: false });
    if (!r2.ok) expect(r2.erro).toContain("na conta de R$");
  });
});
