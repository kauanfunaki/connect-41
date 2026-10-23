import { describe, expect, it } from "vitest";
import {
  competenciaDaParcela,
  dividirEmParcelas,
  lerCompetenciaDasParcelas,
  lerParcelas,
  propostaDeParcelas,
  somaDasParcelas,
  vencimentosDasParcelas,
  MAXIMO_DE_PARCELAS,
} from "./parcelamento";

// O parcelamento (22/10/2026): um total dividido em parcelas, com os centavos
// que sobram numa parcela só, um vencimento por mês no ajuste da repetição, e
// o que vem da tela conferido no servidor — a soma fecha com o total.

describe("dividirEmParcelas", () => {
  it("divide por igual e põe o resto na primeira, ou na última", () => {
    expect(dividirEmParcelas(100000, 3)).toEqual([33334, 33333, 33333]);
    expect(dividirEmParcelas(100000, 3, "ULTIMA")).toEqual([33333, 33333, 33334]);
    expect(dividirEmParcelas(120000, 12)).toEqual(Array(12).fill(10000));
  });

  it("a soma é sempre o total, até no teto de parcelas", () => {
    for (const total of [1999, 100001, 123456789]) {
      expect(dividirEmParcelas(total, 7).reduce((s, v) => s + v, 0)).toBe(total);
    }
    expect(dividirEmParcelas(999999, MAXIMO_DE_PARCELAS)).toHaveLength(120);
  });

  it("não divide o que não dá um centavo por parcela, nem número de parcelas inválido", () => {
    expect(dividirEmParcelas(2, 3)).toEqual([]);
    expect(dividirEmParcelas(1000, 0)).toEqual([]);
    expect(dividirEmParcelas(1000, 2.5)).toEqual([]);
  });
});

describe("vencimentosDasParcelas", () => {
  it("um por mês, a primeira como digitada, as outras ajustadas no fim de semana", () => {
    // 22/11/2026 é domingo: adia para a segunda.
    expect(vencimentosDasParcelas("2026-10-22", 3)).toEqual(["2026-10-22", "2026-11-23", "2026-12-22"]);
    expect(vencimentosDasParcelas("2026-10-22", 3, "MANTER")).toEqual(["2026-10-22", "2026-11-22", "2026-12-22"]);
    expect(vencimentosDasParcelas("2026-10-22", 3, "ANTECIPAR")).toEqual(["2026-10-22", "2026-11-20", "2026-12-22"]);
  });

  it("respeita os feriados do escritório", () => {
    expect(vencimentosDasParcelas("2026-10-22", 3, "ADIAR", new Set(["2026-12-22"]))).toEqual(["2026-10-22", "2026-11-23", "2026-12-23"]);
  });

  it("no mês sem o dia, o último dia do mês, e volta ao dia nos seguintes", () => {
    expect(vencimentosDasParcelas("2026-10-31", 5, "MANTER")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("data inválida não dá vencimento nenhum", () => {
    expect(vencimentosDasParcelas("2026-02-30", 3)).toEqual([]);
  });
});

describe("propostaDeParcelas", () => {
  it("junta valor e vencimento de cada parcela", () => {
    expect(propostaDeParcelas({ totalCentavos: 100000, parcelas: 3, primeiroVencimentoKey: "2026-10-22", resto: "ULTIMA" })).toEqual([
      { indice: 1, vencimentoKey: "2026-10-22", centavos: 33333 },
      { indice: 2, vencimentoKey: "2026-11-23", centavos: 33333 },
      { indice: 3, vencimentoKey: "2026-12-22", centavos: 33334 },
    ]);
  });

  it("sem valor ou sem data, nada", () => {
    expect(propostaDeParcelas({ totalCentavos: 1, parcelas: 3, primeiroVencimentoKey: "2026-10-22" })).toEqual([]);
    expect(propostaDeParcelas({ totalCentavos: 1000, parcelas: 3, primeiroVencimentoKey: "" })).toEqual([]);
  });
});

describe("lerParcelas", () => {
  const json = (linhas: unknown) => JSON.stringify(linhas);

  it("aceita as parcelas editadas que somam o total", () => {
    const r = lerParcelas(
      json([
        { vencimento: "2026-10-22", centavos: 50000 },
        { vencimento: "2026-11-25", centavos: 30000 },
        { vencimento: "2026-12-22", centavos: 20000 },
      ]),
      100000
    );
    expect(r).toEqual({
      ok: true,
      parcelas: [
        { indice: 1, vencimentoKey: "2026-10-22", centavos: 50000 },
        { indice: 2, vencimentoKey: "2026-11-25", centavos: 30000 },
        { indice: 3, vencimentoKey: "2026-12-22", centavos: 20000 },
      ],
    });
    if (r.ok) expect(somaDasParcelas(r.parcelas)).toBe(100000);
  });

  it("recusa a soma que não fecha, dizendo a diferença", () => {
    const r = lerParcelas(json([{ vencimento: "2026-10-22", centavos: 50000 }, { vencimento: "2026-11-22", centavos: 49999 }]), 100000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("ajuste uma delas");
  });

  it("recusa parcela fora de ordem, sem data, sem valor ou com centavo quebrado", () => {
    expect(lerParcelas(json([{ vencimento: "2026-11-22", centavos: 1 }, { vencimento: "2026-10-22", centavos: 1 }]), 2)).toMatchObject({
      ok: false,
      erro: expect.stringContaining("vence antes"),
    });
    expect(lerParcelas(json([{ vencimento: "", centavos: 1 }, { vencimento: "2026-10-22", centavos: 1 }]), 2)).toMatchObject({
      erro: "Informe o vencimento da parcela 1.",
    });
    expect(lerParcelas(json([{ vencimento: "2026-10-22", centavos: 0 }, { vencimento: "2026-10-22", centavos: 2 }]), 2)).toMatchObject({ ok: false });
    expect(lerParcelas(json([{ vencimento: "2026-10-22", centavos: 1.5 }, { vencimento: "2026-10-22", centavos: 0.5 }]), 2)).toMatchObject({ ok: false });
  });

  it("recusa uma parcela só, mais que o teto e o que não é lista", () => {
    expect(lerParcelas(json([{ vencimento: "2026-10-22", centavos: 1 }]), 1)).toMatchObject({ ok: false, erro: "Parcele em duas vezes ou mais." });
    const muitas = Array.from({ length: MAXIMO_DE_PARCELAS + 1 }, () => ({ vencimento: "2026-10-22", centavos: 1 }));
    expect(lerParcelas(json(muitas), muitas.length)).toMatchObject({ ok: false });
    expect(lerParcelas("{", 1)).toMatchObject({ ok: false });
    expect(lerParcelas(json({ a: 1 }), 1)).toMatchObject({ ok: false });
  });
});

// A competência das parcelas (23/10/2026): a da compra, em todas, ou o mês
// do vencimento de cada uma.
describe("competência das parcelas", () => {
  it("ausente ou vazio é a da compra (o formulário de antes não mandava); o resto é recusado", () => {
    expect(lerCompetenciaDasParcelas(undefined)).toBe("COMPRA");
    expect(lerCompetenciaDasParcelas(null)).toBe("COMPRA");
    expect(lerCompetenciaDasParcelas("")).toBe("COMPRA");
    expect(lerCompetenciaDasParcelas("COMPRA")).toBe("COMPRA");
    expect(lerCompetenciaDasParcelas("VENCIMENTO")).toBe("VENCIMENTO");
    expect(lerCompetenciaDasParcelas("vencimento")).toBeNull();
    expect(lerCompetenciaDasParcelas("2026-10")).toBeNull();
  });

  it("da compra: a digitada, em todas; do vencimento: o mês de cada uma, virando o ano", () => {
    const proposta = propostaDeParcelas({ totalCentavos: 100000, parcelas: 4, primeiroVencimentoKey: "2026-10-15" });
    expect(proposta.map((p) => competenciaDaParcela(p, "2026-09", "COMPRA"))).toEqual(["2026-09", "2026-09", "2026-09", "2026-09"]);
    expect(proposta.map((p) => competenciaDaParcela(p, "2026-09", "VENCIMENTO"))).toEqual(
      proposta.map((p) => p.vencimentoKey.slice(0, 7))
    );
    expect(proposta.map((p) => competenciaDaParcela(p, "2026-09", "VENCIMENTO"))).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
  });
});
