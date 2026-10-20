import { describe, expect, it } from "vitest";
import { cicloDaCompra, cicloDoMes, descricaoDaFatura, finalDoCartao, mesDoCiclo, situacaoDaFatura, validarCartao } from "./cartao";
import { ehCartaoDeCredito, ehContaForaDoCaixa } from "./tiposDeConta";

describe("cicloDaCompra", () => {
  const fecha25vence5 = { fechamento: 25, vencimento: 5 };

  it("antes do fechamento, a fatura que fecha no mês; do fechamento em diante, a seguinte", () => {
    expect(cicloDaCompra("2026-10-10", fecha25vence5)).toEqual({ ciclo: "2026-11", fechamentoKey: "2026-10-25", vencimentoKey: "2026-11-05" });
    expect(cicloDaCompra("2026-10-24", fecha25vence5).ciclo).toBe("2026-11");
    expect(cicloDaCompra("2026-10-25", fecha25vence5)).toEqual({ ciclo: "2026-12", fechamentoKey: "2026-11-25", vencimentoKey: "2026-12-05" });
  });

  it("a virada do ano", () => {
    expect(cicloDaCompra("2026-12-26", fecha25vence5)).toEqual({ ciclo: "2027-02", fechamentoKey: "2027-01-25", vencimentoKey: "2027-02-05" });
    expect(cicloDaCompra("2026-12-01", fecha25vence5).ciclo).toBe("2027-01");
  });

  it("vencimento depois do fechamento no calendário: vence no mesmo mês em que fecha", () => {
    expect(cicloDaCompra("2026-10-02", { fechamento: 5, vencimento: 15 })).toEqual({ ciclo: "2026-10", fechamentoKey: "2026-10-05", vencimentoKey: "2026-10-15" });
    expect(cicloDaCompra("2026-10-05", { fechamento: 5, vencimento: 15 }).ciclo).toBe("2026-11");
  });

  it("o dia 31 vira o último dia do mês curto", () => {
    const fecha31vence10 = { fechamento: 31, vencimento: 10 };
    expect(cicloDaCompra("2027-02-27", fecha31vence10)).toEqual({ ciclo: "2027-03", fechamentoKey: "2027-02-28", vencimentoKey: "2027-03-10" });
    expect(cicloDaCompra("2027-02-28", fecha31vence10).fechamentoKey).toBe("2027-03-31");
    expect(cicloDaCompra("2026-10-10", { fechamento: 20, vencimento: 31 }).vencimentoKey).toBe("2026-10-31");
    expect(cicloDaCompra("2026-11-10", { fechamento: 20, vencimento: 31 }).vencimentoKey).toBe("2026-11-30");
  });

  it("fechamento no dia 1: o mês inteiro fecha no dia 1 do seguinte", () => {
    expect(cicloDaCompra("2026-10-01", { fechamento: 1, vencimento: 10 })).toEqual({ ciclo: "2026-11", fechamentoKey: "2026-11-01", vencimentoKey: "2026-11-10" });
    expect(cicloDaCompra("2026-10-31", { fechamento: 1, vencimento: 10 }).ciclo).toBe("2026-11");
  });

  it("cicloDoMes desfaz o caminho: do mês em que vence, o dia em que fecha", () => {
    for (const [dia, dias] of [
      ["2026-10-10", fecha25vence5],
      ["2026-12-26", fecha25vence5],
      ["2026-10-02", { fechamento: 5, vencimento: 15 }],
      ["2027-02-27", { fechamento: 31, vencimento: 10 }],
    ] as const) {
      const c = cicloDaCompra(dia, dias);
      expect(cicloDoMes(c.ciclo, dias)).toEqual(c);
    }
  });
});

describe("a fatura", () => {
  it("o mês e a descrição", () => {
    expect(mesDoCiclo("2026-11")).toBe("novembro/2026");
    expect(descricaoDaFatura("Itaú Visa", "2027-01")).toBe("Fatura do cartão Itaú Visa — janeiro/2027");
  });

  it("a situação: aberta até fechar, fechada esperando o pagamento, paga", () => {
    const f = { status: "CONFERIDO", baixadoCentavos: 0, fechamentoKey: "2026-10-25" };
    expect(situacaoDaFatura(f, "2026-10-24")).toBe("Aberta");
    expect(situacaoDaFatura(f, "2026-10-25")).toBe("Fechada");
    expect(situacaoDaFatura({ ...f, baixadoCentavos: 100 }, "2026-10-26")).toBe("Paga em parte");
    expect(situacaoDaFatura({ ...f, status: "PAGO", baixadoCentavos: 100 }, "2026-10-26")).toBe("Paga");
  });
});

describe("validarCartao", () => {
  const ok = { nome: " Itaú Visa ", banco: "341", final: "1234", fechamento: "25", vencimento: "5" };

  it("o cartão bom vira a conta do cadastro", () => {
    expect(validarCartao(ok)).toEqual({
      ok: true,
      dados: { nickname: "Itaú Visa", bankCode: "341", accountNumber: "final 1234", accountDigits: "cartao1234", cardClosingDay: 25, cardDueDay: 5 },
    });
    const semBanco = validarCartao({ ...ok, banco: "" });
    expect(semBanco.ok && semBanco.dados.bankCode).toBe("000");
    expect(finalDoCartao("final 1234")).toBe("1234");
  });

  it("recusa o que não fecha", () => {
    const erro = (c: Partial<typeof ok>) => {
      const r = validarCartao({ ...ok, ...c });
      return r.ok ? null : r.erro;
    };
    expect(erro({ nome: "" })).toMatch(/nome/);
    expect(erro({ final: "123" })).toMatch(/quatro últimos/);
    expect(erro({ final: "12a4" })).toMatch(/quatro últimos/);
    expect(erro({ fechamento: "0" })).toMatch(/fechamento entre 1 e 31/);
    expect(erro({ vencimento: "32" })).toMatch(/vencimento entre 1 e 31/);
    expect(erro({ vencimento: "25" })).toMatch(/mesmo dia/);
    expect(erro({ banco: "12345" })).toMatch(/COMPE/);
  });
});

describe("os tipos fora do caixa", () => {
  it("adiantamento e cartão não são banco; a baixa sem conta é caixa", () => {
    expect(ehContaForaDoCaixa("CARTAO_CREDITO")).toBe(true);
    expect(ehContaForaDoCaixa("ADIANTAMENTO_FORNECEDOR")).toBe(true);
    expect(ehContaForaDoCaixa("CORRENTE")).toBe(false);
    expect(ehContaForaDoCaixa(null)).toBe(false);
    expect(ehCartaoDeCredito("CARTAO_CREDITO")).toBe(true);
    expect(ehCartaoDeCredito("POUPANCA")).toBe(false);
  });
});
