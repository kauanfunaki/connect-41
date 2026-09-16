import { describe, expect, it } from "vitest";
import {
  somarMesesNaData,
  gerarParcelas,
  validarSelecaoDoAcordo,
  validarTermosDoAcordo,
  diferencaDoAcordo,
  podeQuebrar,
  podeDesfazer,
  statusSincronizado,
  resumoDoAcordo,
  categoriaDasParcelas,
  type TituloParaAcordo,
  type ParcelaParaTransicao,
} from "./acordo";

const HOJE = "2026-09-16";

describe("somarMesesNaData", () => {
  it("dia 31 vira o último dia do mês, sem escorregar nas parcelas seguintes", () => {
    expect(somarMesesNaData("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMesesNaData("2026-01-31", 2)).toBe("2026-03-31");
    expect(somarMesesNaData("2028-01-31", 1)).toBe("2028-02-29");
    expect(somarMesesNaData("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("atravessa o ano", () => {
    expect(somarMesesNaData("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("gerarParcelas", () => {
  it("divide em centavos com a sobra na última", () => {
    const p = gerarParcelas({ totalCentavos: 10_000, parcelas: 3, primeiroVencimentoKey: "2026-09-30" });
    expect(p.map((x) => x.valorCentavos)).toEqual([3333, 3333, 3334]);
    expect(p.reduce((n, x) => n + x.valorCentavos, 0)).toBe(10_000);
  });

  it("vencimentos mensais a partir do primeiro, dia 31 respeitando o mês", () => {
    const p = gerarParcelas({ totalCentavos: 400, parcelas: 4, primeiroVencimentoKey: "2026-10-31" });
    expect(p.map((x) => x.vencimentoKey)).toEqual(["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31"]);
    expect(p.map((x) => x.numero)).toEqual([1, 2, 3, 4]);
  });

  it("uma parcela é o valor inteiro; zero parcelas não gera nada", () => {
    expect(gerarParcelas({ totalCentavos: 12_345, parcelas: 1, primeiroVencimentoKey: HOJE })).toEqual([
      { numero: 1, valorCentavos: 12_345, vencimentoKey: HOJE },
    ]);
    expect(gerarParcelas({ totalCentavos: 100, parcelas: 0, primeiroVencimentoKey: HOJE })).toEqual([]);
  });
});

describe("validarSelecaoDoAcordo", () => {
  const t = (x: Partial<TituloParaAcordo> = {}): TituloParaAcordo => ({
    id: "t1",
    kind: "RECEBER",
    status: "CONFERIDO",
    closeReason: null,
    paidAt: null,
    companyId: "emp",
    counterpartyId: "sac",
    vencimentoKey: "2026-08-10",
    valorCentavos: 1000,
    statusDoAcordo: null,
    ...x,
  });

  it("soma os originais do mesmo sacado e da mesma empresa", () => {
    expect(validarSelecaoDoAcordo([t(), t({ id: "t2", valorCentavos: 2550 })], HOJE)).toEqual({
      ok: true,
      companyId: "emp",
      counterpartyId: "sac",
      originalCentavos: 3550,
    });
  });

  it("recusa mistura de sacado ou de empresa", () => {
    expect(validarSelecaoDoAcordo([t(), t({ id: "t2", counterpartyId: "outro" })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t(), t({ id: "t2", companyId: "outra" })], HOJE).ok).toBe(false);
  });

  it("recusa o que não é dívida vencida em aberto", () => {
    expect(validarSelecaoDoAcordo([], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ vencimentoKey: HOJE })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ status: "PAGO", paidAt: new Date() })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ status: "CANCELADO", closeReason: "RENEGOCIADO" })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ status: "CANCELADO", closeReason: "PERDA" })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ kind: "PAGAR" })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t(), t()], HOJE).ok).toBe(false);
  });

  it("parcela de acordo ativo não; de acordo quebrado sim", () => {
    expect(validarSelecaoDoAcordo([t({ statusDoAcordo: "ATIVO" })], HOJE).ok).toBe(false);
    expect(validarSelecaoDoAcordo([t({ statusDoAcordo: "QUEBRADO" })], HOJE).ok).toBe(true);
  });
});

describe("validarTermosDoAcordo", () => {
  it("lê valor pt-BR, parcelas e vencimento", () => {
    expect(validarTermosDoAcordo({ valor: "1.234,56", parcelas: "3", primeiroVencimento: HOJE }, HOJE)).toEqual({
      ok: true,
      dados: { acordadoCentavos: 123_456, parcelas: 3, primeiroVencimentoKey: HOJE, notas: null },
    });
  });

  it("recusa primeira parcela no passado, zero, parcelas demais e parcela de zero centavo", () => {
    expect(validarTermosDoAcordo({ valor: "100", parcelas: "2", primeiroVencimento: "2026-09-15" }, HOJE).ok).toBe(false);
    expect(validarTermosDoAcordo({ valor: "0", parcelas: "2", primeiroVencimento: HOJE }, HOJE).ok).toBe(false);
    expect(validarTermosDoAcordo({ valor: "100", parcelas: "61", primeiroVencimento: HOJE }, HOJE).ok).toBe(false);
    expect(validarTermosDoAcordo({ valor: "0,05", parcelas: "10", primeiroVencimento: HOJE }, HOJE).ok).toBe(false);
    expect(validarTermosDoAcordo({ valor: "100", parcelas: "1,5", primeiroVencimento: HOJE }, HOJE).ok).toBe(false);
  });

  it("diferença positiva é acréscimo, negativa é desconto", () => {
    expect(diferencaDoAcordo(10_000, 11_000)).toBe(1_000);
    expect(diferencaDoAcordo(10_000, 9_000)).toBe(-1_000);
  });
});

describe("transições do acordo", () => {
  const aberta: ParcelaParaTransicao = { status: "CONFERIDO", closeReason: null, paidAt: null };
  const paga: ParcelaParaTransicao = { status: "PAGO", closeReason: null, paidAt: new Date() };
  const perdida: ParcelaParaTransicao = { status: "CANCELADO", closeReason: "PERDA", paidAt: null };
  const cancelada: ParcelaParaTransicao = { status: "CANCELADO", closeReason: "CANCELADO", paidAt: null };
  const renegociada: ParcelaParaTransicao = { status: "CANCELADO", closeReason: "RENEGOCIADO", paidAt: null };

  it("quebrar só de ativo", () => {
    expect(podeQuebrar("ATIVO").pode).toBe(true);
    expect(podeQuebrar("QUEBRADO").pode).toBe(false);
    expect(podeQuebrar("CUMPRIDO").pode).toBe(false);
    expect(podeQuebrar("DESFEITO").pode).toBe(false);
  });

  it("desfazer só sem parcela paga nem perdida, de ativo ou quebrado", () => {
    expect(podeDesfazer("ATIVO", [aberta, aberta]).pode).toBe(true);
    expect(podeDesfazer("QUEBRADO", [aberta]).pode).toBe(true);
    expect(podeDesfazer("ATIVO", [paga, aberta]).pode).toBe(false);
    expect(podeDesfazer("QUEBRADO", [perdida, aberta]).pode).toBe(false);
    expect(podeDesfazer("CUMPRIDO", [paga]).pode).toBe(false);
    expect(podeDesfazer("DESFEITO", [cancelada]).pode).toBe(false);
    expect(podeDesfazer("QUEBRADO", [aberta, renegociada]).pode).toBe(false);
  });

  it("cumprido quando todas pagas — inclusive vindo de quebrado — e volta a ativo se uma baixa é desfeita", () => {
    expect(statusSincronizado("ATIVO", [paga, paga])).toBe("CUMPRIDO");
    expect(statusSincronizado("QUEBRADO", [paga, paga])).toBe("CUMPRIDO");
    expect(statusSincronizado("ATIVO", [paga, aberta])).toBe("ATIVO");
    expect(statusSincronizado("CUMPRIDO", [paga, aberta])).toBe("ATIVO");
    expect(statusSincronizado("QUEBRADO", [paga, aberta])).toBe("QUEBRADO");
    expect(statusSincronizado("DESFEITO", [cancelada])).toBe("DESFEITO");
    expect(statusSincronizado("ATIVO", [paga, perdida])).toBe("ATIVO");
    // Parcela de acordo quebrado renegociada noutro acordo não cumpre este.
    expect(statusSincronizado("QUEBRADO", [paga, renegociada])).toBe("QUEBRADO");
  });

  it("resumo conta o pago e o em aberto, sem as canceladas", () => {
    expect(
      resumoDoAcordo([
        { ...paga, valorCentavos: 100 },
        { ...aberta, valorCentavos: 250 },
        { ...cancelada, valorCentavos: 999 },
        { ...renegociada, valorCentavos: 70 },
      ])
    ).toEqual({ pagas: 1, total: 3, pagoCentavos: 100, emAbertoCentavos: 250 });
  });
});

describe("categoriaDasParcelas", () => {
  it("a comum a todos, ou a do maior original classificado", () => {
    expect(categoriaDasParcelas([{ categoryId: "a", valorCentavos: 1 }, { categoryId: "a", valorCentavos: 9 }])).toBe("a");
    expect(categoriaDasParcelas([{ categoryId: "a", valorCentavos: 1 }, { categoryId: "b", valorCentavos: 9 }])).toBe("b");
    expect(categoriaDasParcelas([{ categoryId: null, valorCentavos: 9 }, { categoryId: "a", valorCentavos: 1 }])).toBe("a");
    expect(categoriaDasParcelas([{ categoryId: null, valorCentavos: 9 }])).toBeNull();
  });
});
