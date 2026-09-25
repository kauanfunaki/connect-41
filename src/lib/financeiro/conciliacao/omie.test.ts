import { describe, expect, it } from "vitest";
import { parearPeloOmie } from "./omie";

describe("parearPeloOmie", () => {
  const baixa = (id: string, kind: "PAGAR" | "RECEBER", centavos: number, pagoEmKey = "2026-08-03") => ({ id, kind, centavos, pagoEmKey });

  it("casa saída com a pagar e entrada com a receber, no valor e no dia", () => {
    expect(
      parearPeloOmie(
        [
          { id: "t1", centavos: -15025, dataKey: "2026-08-03" },
          { id: "t2", centavos: 50000, dataKey: "2026-08-03" },
        ],
        [baixa("p", "PAGAR", 15025), baixa("r", "RECEBER", 50000)]
      )
    ).toEqual([
      { transacaoId: "t1", lancamentoId: "p" },
      { transacaoId: "t2", lancamentoId: "r" },
    ]);
  });

  it("não casa com sinal trocado, dia diferente ou centavo diferente", () => {
    expect(
      parearPeloOmie(
        [
          { id: "t1", centavos: 15025, dataKey: "2026-08-03" },
          { id: "t2", centavos: -15025, dataKey: "2026-08-04" },
          { id: "t3", centavos: -15026, dataKey: "2026-08-03" },
        ],
        [baixa("p", "PAGAR", 15025)]
      )
    ).toEqual([]);
  });

  it("dois boletos iguais no mesmo dia ficam para gente", () => {
    expect(
      parearPeloOmie([{ id: "t1", centavos: -1000, dataKey: "2026-08-03" }], [baixa("a", "PAGAR", 1000), baixa("b", "PAGAR", 1000)])
    ).toEqual([]);
    expect(
      parearPeloOmie(
        [
          { id: "t1", centavos: -1000, dataKey: "2026-08-03" },
          { id: "t2", centavos: -1000, dataKey: "2026-08-03" },
        ],
        [baixa("a", "PAGAR", 1000)]
      )
    ).toEqual([]);
  });
});
