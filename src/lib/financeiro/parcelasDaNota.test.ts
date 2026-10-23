import { describe, expect, it } from "vitest";
import { planoDaNota } from "./parcelasDaNota";

// A conta a pagar da nota de compra nasce das duplicatas (23/10): parcelada
// quando há duas ou mais que fecham com a conta, vencendo na duplicata quando
// há uma, e como sempre quando a nota não diz — ou quando não fecha.

const d = (vencimento: string, valor: string, numero: string | null = null) => ({ numero, vencimento, valor });

describe("planoDaNota", () => {
  it("sem duplicatas (null, ausente ou lista vazia): como sempre", () => {
    expect(planoDaNota({ duplicatas: null, totalCentavos: 100000, kind: "PAGAR" })).toEqual({ tipo: "SEM_DUPLICATAS" });
    expect(planoDaNota({ duplicatas: undefined, totalCentavos: 100000, kind: "PAGAR" })).toEqual({ tipo: "SEM_DUPLICATAS" });
    expect(planoDaNota({ duplicatas: [], totalCentavos: 100000, kind: "PAGAR" })).toEqual({ tipo: "SEM_DUPLICATAS" });
  });

  it("conta a receber não parcela: o pedido é a nota de compra", () => {
    expect(
      planoDaNota({ duplicatas: [d("2026-10-01", "500.00"), d("2026-11-01", "500.00")], totalCentavos: 100000, kind: "RECEBER" })
    ).toEqual({ tipo: "SEM_DUPLICATAS" });
  });

  it("uma duplicata que fecha: vence nela", () => {
    expect(planoDaNota({ duplicatas: [d("2026-10-01", "1000.00", "001")], totalCentavos: 100000, kind: "PAGAR" })).toEqual({
      tipo: "VENCIMENTO",
      vencimentoKey: "2026-10-01",
      numero: "001",
    });
  });

  it("várias que fecham: uma parcela por duplicata, em ordem de vencimento", () => {
    const r = planoDaNota({
      duplicatas: [d("2026-11-01", "333.33", "002"), d("2026-10-01", "333.34", "001"), d("2026-12-01", "333.33", "003")],
      totalCentavos: 100000,
      kind: "PAGAR",
    });
    expect(r).toEqual({
      tipo: "PARCELAS",
      parcelas: [
        { indice: 1, vencimentoKey: "2026-10-01", centavos: 33334, numero: "001" },
        { indice: 2, vencimentoKey: "2026-11-01", centavos: 33333, numero: "002" },
        { indice: 3, vencimentoKey: "2026-12-01", centavos: 33333, numero: "003" },
      ],
    });
  });

  it("soma que não fecha: recusa com o motivo, e a conta nasce inteira", () => {
    const r = planoDaNota({ duplicatas: [d("2026-10-01", "500.00"), d("2026-11-01", "499.99")], totalCentavos: 100000, kind: "PAGAR" });
    expect(r.tipo).toBe("RECUSADO");
    expect(r.tipo === "RECUSADO" && r.motivo).toMatch(/somam R\$\s?999,99.*R\$\s?1\.000,00/);
  });

  it("uma duplicata que não fecha também recusa — não vira vencimento", () => {
    expect(planoDaNota({ duplicatas: [d("2026-10-01", "900.00")], totalCentavos: 100000, kind: "PAGAR" }).tipo).toBe("RECUSADO");
  });

  it("gravado ilegível, com retenção ou sem valor: recusa", () => {
    expect(planoDaNota({ duplicatas: [{ vencimento: "x" }], totalCentavos: 100000, kind: "PAGAR" }).tipo).toBe("RECUSADO");
    expect(planoDaNota({ duplicatas: { a: 1 }, totalCentavos: 100000, kind: "PAGAR" }).tipo).toBe("RECUSADO");
    expect(
      planoDaNota({ duplicatas: [d("2026-10-01", "500.00"), d("2026-11-01", "500.00")], totalCentavos: 100000, kind: "PAGAR", comRetencoes: true })
        .tipo
    ).toBe("RECUSADO");
    expect(planoDaNota({ duplicatas: [d("2026-10-01", "500.00")], totalCentavos: null, kind: "PAGAR" }).tipo).toBe("RECUSADO");
  });
});
