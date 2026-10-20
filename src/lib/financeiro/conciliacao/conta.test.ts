import { describe, expect, it } from "vitest";
import { contaConfere, codigoDoBanco, digitosDaConta, validarConta, centavosComSinal, chaveSemNumero } from "./conta";

describe("contaConfere", () => {
  const conta = { accountNumber: "12345-6", agency: "1234" };

  it("mesmo número, com ou sem hífen e zeros à esquerda", () => {
    expect(contaConfere("123456", conta)).toBe(true);
    expect(contaConfere("0000123456", conta)).toBe(true);
    expect(contaConfere("12345-6", conta)).toBe(true);
  });

  it("ACCTID sem o dígito verificador", () => {
    expect(contaConfere("12345", conta)).toBe(true);
    expect(contaConfere("0012345", { accountNumber: "123456", agency: null })).toBe(true);
  });

  it("agência na frente do número", () => {
    expect(contaConfere("1234123456", conta)).toBe(true);
    expect(contaConfere("12340012345", conta)).toBe(true);
  });

  it("recusa conta diferente", () => {
    expect(contaConfere("654321", conta)).toBe(false);
    expect(contaConfere("123457", conta)).toBe(false);
    expect(contaConfere("9999123456", conta)).toBe(false);
    expect(contaConfere("", conta)).toBe(false);
  });

  it("número curto não ganha a tolerância do dígito", () => {
    expect(contaConfere("1", { accountNumber: "10", agency: null })).toBe(false);
  });
});

describe("normalização", () => {
  it("dígitos e banco", () => {
    expect(digitosDaConta("00.123-4")).toBe("1234");
    expect(codigoDoBanco("341")).toBe("341");
    expect(codigoDoBanco("0341")).toBe("341");
    expect(codigoDoBanco("1")).toBe("001");
    expect(codigoDoBanco("12345")).toBeNull();
    expect(codigoDoBanco("")).toBeNull();
  });

  it("saldo com sinal", () => {
    expect(centavosComSinal("-1.234,56")).toBe(-123_456);
    expect(centavosComSinal("10")).toBe(1_000);
    expect(centavosComSinal("-")).toBeNull();
  });
});

describe("validarConta", () => {
  const base = {
    nickname: "Itaú movimento",
    bankCode: "341",
    agency: "1234",
    accountNumber: "12345-6",
    type: "CORRENTE",
    openingBalance: "",
    openingBalanceDate: "",
  };

  it("aceita o cadastro sem saldo inicial", () => {
    const r = validarConta(base);
    expect(r).toEqual({
      ok: true,
      dados: expect.objectContaining({ bankCode: "341", accountDigits: "123456", saldoInicialCentavos: null, saldoInicialKey: null }),
    });
  });

  it("saldo inicial negativo com data", () => {
    const r = validarConta({ ...base, openingBalance: "-500,00", openingBalanceDate: "2026-09-01" });
    expect(r).toEqual({ ok: true, dados: expect.objectContaining({ saldoInicialCentavos: -50_000, saldoInicialKey: "2026-09-01" }) });
  });

  it("saldo sem data e data sem saldo são recusados", () => {
    expect(validarConta({ ...base, openingBalance: "10" }).ok).toBe(false);
    expect(validarConta({ ...base, openingBalanceDate: "2026-09-01" }).ok).toBe(false);
  });

  it("recusas de cadastro", () => {
    expect(validarConta({ ...base, nickname: " " }).ok).toBe(false);
    expect(validarConta({ ...base, bankCode: "abc" }).ok).toBe(false);
    expect(validarConta({ ...base, accountNumber: "12a45" }).ok).toBe(false);
    expect(validarConta({ ...base, accountNumber: "000" }).ok).toBe(false);
    expect(validarConta({ ...base, type: "CARTAO" }).ok).toBe(false);
    expect(validarConta({ ...base, openingBalance: "1", openingBalanceDate: "2026-02-30" }).ok).toBe(false);
  });

  it("os tipos do Omie (lote D, 20/10): com extrato, banco e número continuam obrigatórios", () => {
    expect(validarConta({ ...base, type: "CONTA_PAGAMENTO" })).toEqual({ ok: true, dados: expect.objectContaining({ type: "CONTA_PAGAMENTO", accountDigits: "123456" }) });
    expect(validarConta({ ...base, type: "APLICACAO", accountNumber: "" }).ok).toBe(false);
    expect(validarConta({ ...base, type: "CONTA_GARANTIDA", bankCode: "" }).ok).toBe(false);
  });

  it("sem extrato, banco e número são opcionais, e o nome vira a chave", () => {
    const caixa = validarConta({ ...base, nickname: "Caixa da Loja Três", type: "CAIXINHA", bankCode: "", agency: "", accountNumber: "" });
    expect(caixa).toEqual({
      ok: true,
      dados: expect.objectContaining({ type: "CAIXINHA", bankCode: "000", agency: null, accountNumber: "", accountDigits: "sem-caixadalojatres" }),
    });
    expect(chaveSemNumero("Mútuo do sócio")).toBe("sem-mutuodosocio");
    // Com número, ele vale — o contrato do empréstimo, por exemplo.
    const emprestimo = validarConta({ ...base, type: "EMPRESTIMO", accountNumber: "9988-7", openingBalance: "-50.000,00", openingBalanceDate: "2026-09-01" });
    expect(emprestimo).toEqual({ ok: true, dados: expect.objectContaining({ bankCode: "341", accountDigits: "99887", saldoInicialCentavos: -5_000_000 }) });
  });

  it("o adiantamento e o cartão não se cadastram aqui", () => {
    expect(validarConta({ ...base, type: "ADIANTAMENTO_FORNECEDOR" })).toEqual({ ok: false, erro: "Escolha o tipo da conta." });
    expect(validarConta({ ...base, type: "CARTAO_CREDITO" }).ok).toBe(false);
  });
});
