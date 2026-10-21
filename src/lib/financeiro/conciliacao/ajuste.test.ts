import { describe, expect, it } from "vitest";
import { baixaDoAjuste, lerAjuste } from "./ajuste";

// O que se testa (19/10): a diferença entre a linha do extrato e a conta vira
// juros e multa, desconto ou baixa parcial — e só no sentido que faz sentido.
describe("baixaDoAjuste", () => {
  it("linha maior que a conta: juros e multa somam a diferença e a conta quita", () => {
    expect(baixaDoAjuste(100_000, -102_300, { tipo: "encargos", jurosCentavos: 300, multaCentavos: 2_000 })).toEqual({
      ok: true,
      baixa: { principalCentavos: 100_000, jurosCentavos: 300, multaCentavos: 2_000, descontoCentavos: 0, caixaCentavos: 102_300 },
    });
  });

  it("juros e multa que não fecham a diferença: recusa com os dois números", () => {
    const r = baixaDoAjuste(100_000, -102_300, { tipo: "encargos", jurosCentavos: 300, multaCentavos: 0 });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toMatch(/somam R\$\s?3,00.*R\$\s?23,00/);
  });

  it("linha menor: desconto quita a conta pelo valor da linha", () => {
    expect(baixaDoAjuste(100_000, 95_000, { tipo: "desconto" })).toEqual({
      ok: true,
      baixa: { principalCentavos: 100_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 5_000, caixaCentavos: 95_000 },
    });
  });

  it("linha menor: parcial baixa só o valor da linha", () => {
    expect(baixaDoAjuste(100_000, -40_000, { tipo: "parcial" })).toMatchObject({ ok: true, baixa: { principalCentavos: 40_000, descontoCentavos: 0, caixaCentavos: 40_000 } });
  });

  it("recusa o sentido trocado, a linha igual e a conta sem saldo", () => {
    expect(baixaDoAjuste(100_000, 102_300, { tipo: "desconto" })).toMatchObject({ ok: false });
    expect(baixaDoAjuste(100_000, 102_300, { tipo: "parcial" })).toMatchObject({ ok: false });
    expect(baixaDoAjuste(100_000, 95_000, { tipo: "encargos", jurosCentavos: 0, multaCentavos: 0 })).toMatchObject({ ok: false });
    expect(baixaDoAjuste(100_000, 100_000, { tipo: "desconto" })).toMatchObject({ ok: false });
    expect(baixaDoAjuste(0, 100, { tipo: "parcial" })).toMatchObject({ ok: false });
  });

  it("juros negativo ou quebrado não passa", () => {
    expect(baixaDoAjuste(100_000, 102_300, { tipo: "encargos", jurosCentavos: 2_400, multaCentavos: -100 })).toMatchObject({ ok: false });
    expect(baixaDoAjuste(100_000, 102_300, { tipo: "encargos", jurosCentavos: 2_299.5, multaCentavos: 0.5 })).toMatchObject({ ok: false });
  });
});

describe("lerAjuste", () => {
  it("aceita as três formas e recusa o resto", () => {
    expect(lerAjuste({ tipo: "desconto" })).toEqual({ tipo: "desconto" });
    expect(lerAjuste({ tipo: "parcial", extra: 1 })).toEqual({ tipo: "parcial" });
    expect(lerAjuste({ tipo: "encargos", jurosCentavos: 1, multaCentavos: 2 })).toEqual({ tipo: "encargos", jurosCentavos: 1, multaCentavos: 2 });
    expect(lerAjuste({ tipo: "encargos", jurosCentavos: "1", multaCentavos: 2 })).toBeNull();
    expect(lerAjuste("desconto")).toBeNull();
    expect(lerAjuste(null)).toBeNull();
  });
});
