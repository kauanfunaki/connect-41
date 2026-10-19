import { describe, expect, it } from "vitest";
import { validarBaixa, saldoEmAberto, estadoDaConta, categoriaDaParte, ehCategoriaDaParte, movimentosDaBaixa } from "./regras";

const HOJE = "2026-10-19";

describe("validarBaixa", () => {
  it("baixa cheia, sem encargos: quita e o total é o principal", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "1.000,00" }, 100_000, HOJE)).toEqual({
      ok: true,
      dados: { dataKey: "2026-10-15", principalCentavos: 100_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, caixaCentavos: 100_000, quita: true },
    });
  });

  it("com multa e juros, o total passa do principal e a conta quita", () => {
    const r = validarBaixa({ data: "2026-10-15", principal: "1000", juros: "3,00", multa: "20,00" }, 100_000, HOJE);
    expect(r).toMatchObject({ ok: true, dados: { caixaCentavos: 102_300, quita: true } });
  });

  it("parcial: menos que o saldo não quita", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "400" }, 100_000, HOJE)).toMatchObject({ ok: true, dados: { quita: false, caixaCentavos: 40_000 } });
  });

  it("desconto reduz o total; desconto de 100% deixa total zero", () => {
    expect(validarBaixa({ data: "2026-10-15", principal: "100", desconto: "10" }, 10_000, HOJE)).toMatchObject({ ok: true, dados: { caixaCentavos: 9_000 } });
    expect(validarBaixa({ data: "2026-10-15", principal: "100", desconto: "100" }, 10_000, HOJE)).toMatchObject({ ok: true, dados: { caixaCentavos: 0 } });
  });

  it("recusas: data futura, acima do saldo, zero, desconto maior que o total, sem saldo, texto ilegível", () => {
    expect(validarBaixa({ data: "2026-10-20", principal: "10" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/agendamento/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10,01" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/saldo/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "0" }, 1_000, HOJE).ok).toBe(false);
    expect(validarBaixa({ data: "2026-10-15", principal: "10", desconto: "10,01" }, 1_000, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/desconto/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10" }, 0, HOJE)).toMatchObject({ ok: false, erro: expect.stringMatching(/saldo/) });
    expect(validarBaixa({ data: "2026-10-15", principal: "10", juros: "abc" }, 1_000, HOJE).ok).toBe(false);
    expect(validarBaixa({ data: "", principal: "10" }, 1_000, HOJE).ok).toBe(false);
  });
});

describe("saldoEmAberto", () => {
  it("nunca negativo", () => {
    expect(saldoEmAberto(1_000, 400)).toBe(600);
    expect(saldoEmAberto(1_000, 1_200)).toBe(0);
  });
});

describe("estadoDaConta", () => {
  const conta = { valorCentavos: 100_000, status: "CONFERIDO" as const };

  it("sem baixa: como estava", () => {
    expect(estadoDaConta(conta, [])).toEqual({ baixadoCentavos: 0, quitada: false, ultimaDataKey: null, status: "CONFERIDO" });
  });

  it("parcial continua em aberto, sem data de pagamento", () => {
    expect(estadoDaConta(conta, [{ principalCentavos: 40_000, dataKey: "2026-10-05" }])).toEqual({
      baixadoCentavos: 40_000,
      quitada: false,
      ultimaDataKey: null,
      status: "CONFERIDO",
    });
  });

  it("quitada em duas vezes: paga, com a data da última", () => {
    const r = estadoDaConta(conta, [
      { principalCentavos: 60_000, dataKey: "2026-10-12" },
      { principalCentavos: 40_000, dataKey: "2026-10-05" },
    ]);
    expect(r).toEqual({ baixadoCentavos: 100_000, quitada: true, ultimaDataKey: "2026-10-12", status: "PAGO" });
  });

  it("paga que perdeu a baixa volta a conferida; provisória que recebeu parcial continua provisória", () => {
    expect(estadoDaConta({ ...conta, status: "PAGO" }, [{ principalCentavos: 10_000, dataKey: "2026-10-05" }]).status).toBe("CONFERIDO");
    expect(estadoDaConta({ ...conta, status: "PROVISORIO" }, [{ principalCentavos: 10_000, dataKey: "2026-10-05" }]).status).toBe("PROVISORIO");
  });

  it("cancelada continua cancelada", () => {
    expect(estadoDaConta({ ...conta, status: "CANCELADO" }, []).status).toBe("CANCELADO");
  });
});

describe("categoriaDaParte", () => {
  it("conta a pagar: juros e multa são despesa; desconto obtido é receita", () => {
    expect(categoriaDaParte("PAGAR", "encargos")).toEqual({ nome: "Juros pagos para Fornecedores", kind: "PAGAR", dreGroup: "outras_despesas" });
    expect(categoriaDaParte("PAGAR", "desconto")).toMatchObject({ kind: "RECEBER", dreGroup: "outras_receitas" });
  });

  it("conta a receber: juros e multa recebidos são receita; desconto concedido é despesa", () => {
    expect(categoriaDaParte("RECEBER", "encargos")).toMatchObject({ kind: "RECEBER", dreGroup: "outras_receitas" });
    expect(categoriaDaParte("RECEBER", "desconto")).toMatchObject({ kind: "PAGAR", dreGroup: "outras_despesas" });
  });

  it("casa pelo nome sem acento nem caixa", () => {
    expect(ehCategoriaDaParte("juros pagos para fornecedores", categoriaDaParte("PAGAR", "encargos"))).toBe(true);
    expect(ehCategoriaDaParte("Juros sobre empréstimos", categoriaDaParte("PAGAR", "encargos"))).toBe(false);
  });
});

describe("movimentosDaBaixa", () => {
  const base = { categoryId: "cat", interestCategoryId: "jur", discountCategoryId: "desc" };

  it("conta a pagar: principal e encargos saem, desconto entra — a soma é o total pago", () => {
    const m = movimentosDaBaixa({ ...base, kind: "PAGAR", principalCentavos: 100_000, jurosCentavos: 300, multaCentavos: 2_000, descontoCentavos: 500 });
    expect(m).toEqual([
      { kind: "PAGAR", centavos: 100_000, categoryId: "cat", parte: "principal" },
      { kind: "PAGAR", centavos: 2_300, categoryId: "jur", parte: "encargos" },
      { kind: "RECEBER", centavos: 500, categoryId: "desc", parte: "desconto" },
    ]);
    const liquido = m.reduce((s, x) => s + (x.kind === "PAGAR" ? x.centavos : -x.centavos), 0);
    expect(liquido).toBe(101_800);
  });

  it("sem encargos nem desconto: só o principal", () => {
    expect(movimentosDaBaixa({ ...base, kind: "RECEBER", principalCentavos: 1_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0 })).toHaveLength(1);
  });

  it("conta a receber: desconto concedido sai", () => {
    const m = movimentosDaBaixa({ ...base, kind: "RECEBER", principalCentavos: 1_000, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 100 });
    expect(m[1]).toEqual({ kind: "PAGAR", centavos: 100, categoryId: "desc", parte: "desconto" });
  });
});
