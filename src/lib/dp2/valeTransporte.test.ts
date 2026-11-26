import { describe, expect, it } from "vitest";
import { descontoDoValeTransporte } from "./mensal";

describe("descontoDoValeTransporte", () => {
  it("sem custo diário fica nos 6%", () => {
    expect(descontoDoValeTransporte(3000, null, 21, 30)).toMatchObject({ valor: 180, limitado: false, custo: null });
  });

  it("limita ao custo quando o benefício custa menos que 6%", () => {
    // 8,00 × 21 = 168,00 < 180,00
    expect(descontoDoValeTransporte(3000, 8, 21, 30)).toMatchObject({ valor: 168, limitado: true, custo: 168, diasUteis: 21 });
    // 10,00 × 21 = 210,00 > 180,00: fica nos 6%
    expect(descontoDoValeTransporte(3000, 10, 21, 30)).toMatchObject({ valor: 180, limitado: false, custo: 210 });
  });

  it("os dias úteis acompanham os dias de salário", () => {
    // 15 dias de salário: metade dos dias úteis (10,5 → 11), 6% de 1.500 = 90; custo 5 × 11 = 55.
    expect(descontoDoValeTransporte(1500, 5, 21, 15)).toMatchObject({ valor: 55, diasUteis: 11 });
  });
});
