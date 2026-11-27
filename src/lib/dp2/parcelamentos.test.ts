import { describe, expect, it } from "vitest";
import { gerarParcelas, lerPagamento, lerParcelamento, situacaoDoParcelamento, vencimentoDaParcela } from "./parcelamentos";

describe("parcelamento de encargos", () => {
  it("lê o parcelamento", () => {
    const base = { tipo: "INSS_RFB", numero: "1234567", valorConsolidado: "10.000,00", quantidade: "60", primeiroVencimento: "2027-01-31", observacao: "" };
    expect(lerParcelamento(base)).toEqual({ ok: true, parcelamento: { tipo: "INSS_RFB", numero: "1234567", valorConsolidado: 10000, quantidade: 60, primeiroVencimento: "2027-01-31", observacao: null } });
    expect(lerParcelamento({ ...base, tipo: "X" })).toMatchObject({ ok: false });
    expect(lerParcelamento({ ...base, quantidade: "0" })).toMatchObject({ ok: false });
    expect(lerParcelamento({ ...base, numero: " " })).toMatchObject({ ok: false });
  });

  it("vencimentos mês a mês, no fim do mês quando o dia não existe", () => {
    expect(vencimentoDaParcela("2027-01-31", 1)).toBe("2027-01-31");
    expect(vencimentoDaParcela("2027-01-31", 2)).toBe("2027-02-28");
    expect(vencimentoDaParcela("2027-11-15", 3)).toBe("2028-01-15");
  });

  it("parcelas iguais, com os centavos na última", () => {
    const p = gerarParcelas({ valorConsolidado: 1000, quantidade: 3, primeiroVencimento: "2027-01-10" });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000, 2);
  });

  it("situação: pagas, vencidas, saldo e a próxima", () => {
    const parcelas = gerarParcelas({ valorConsolidado: 300, quantidade: 3, primeiroVencimento: "2027-01-10" }).map((p, i) => ({ ...p, pagaEm: i === 0 ? "2027-01-09" : null, valorPago: i === 0 ? 101.5 : null }));
    expect(situacaoDoParcelamento(parcelas, "2027-02-20")).toMatchObject({ pagas: 1, total: 3, pago: 101.5, saldo: 200, vencidas: 1, proxima: { numero: 3 }, quitado: false });
  });

  it("o pagamento sem valor usa o da parcela", () => {
    expect(lerPagamento({ pagaEm: "2027-01-09", valorPago: "" }, { valor: 100 })).toEqual({ ok: true, pagaEm: "2027-01-09", valorPago: 100 });
    expect(lerPagamento({ pagaEm: "2027-01-09", valorPago: "102,35" }, { valor: 100 })).toEqual({ ok: true, pagaEm: "2027-01-09", valorPago: 102.35 });
    expect(lerPagamento({ pagaEm: "", valorPago: "" }, { valor: 100 })).toMatchObject({ ok: false });
  });
});
