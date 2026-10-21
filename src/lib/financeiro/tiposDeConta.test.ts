import { describe, expect, it } from "vitest";
import { BankAccountType } from "@/generated/prisma/enums";
import {
  ehContaForaDoCaixa,
  grupoDoTipo,
  rotuloDoTipo,
  temExtrato,
  temPortaPropria,
  tipoDeConta,
  TIPOS_COM_EXTRATO,
  TIPOS_COM_PORTA_PROPRIA,
  TIPOS_DE_CONTA,
  TIPOS_DO_CADASTRO,
  TIPOS_FORA_DO_CAIXA,
} from "./tiposDeConta";

describe("os tipos de conta", () => {
  it("a tabela tem exatamente os tipos do banco de dados", () => {
    expect(Object.keys(TIPOS_DE_CONTA).sort()).toEqual(Object.values(BankAccountType).sort());
  });

  it("os grupos: banco com extrato, caixa sem extrato, e o que não é dinheiro da empresa", () => {
    expect(TIPOS_COM_EXTRATO).toEqual(["CORRENTE", "POUPANCA", "CONTA_PAGAMENTO", "CONTA_GARANTIDA", "APLICACAO"]);
    expect(TIPOS_FORA_DO_CAIXA).toEqual(["EMPRESTIMO", "MUTUO", "CREDIARIO", "ADMINISTRADORA_CARTOES", "ADIANTAMENTO_FORNECEDOR", "ADIANTAMENTO_CLIENTE", "CARTAO_CREDITO"]);
    expect(grupoDoTipo("CAIXINHA")).toBe("caixa");
    expect(grupoDoTipo("CARTEIRA_VIRTUAL")).toBe("caixa");
  });

  it("a caixinha é dinheiro sem extrato; o empréstimo, nem uma coisa nem outra", () => {
    expect(temExtrato("CAIXINHA")).toBe(false);
    expect(ehContaForaDoCaixa("CAIXINHA")).toBe(false);
    expect(temExtrato("EMPRESTIMO")).toBe(false);
    expect(ehContaForaDoCaixa("EMPRESTIMO")).toBe(true);
    expect(temExtrato("APLICACAO")).toBe(true);
    // A baixa sem conta é caixa, como sempre foi.
    expect(ehContaForaDoCaixa(null)).toBe(false);
    expect(temExtrato(null)).toBe(false);
  });

  it("o adiantamento e o cartão têm a porta deles; o resto se cadastra em Banco e caixa", () => {
    expect(TIPOS_COM_PORTA_PROPRIA).toEqual(["ADIANTAMENTO_FORNECEDOR", "ADIANTAMENTO_CLIENTE", "CARTAO_CREDITO"]);
    expect(temPortaPropria("CARTAO_CREDITO")).toBe(true);
    expect(temPortaPropria("EMPRESTIMO")).toBe(false);
    expect(TIPOS_DO_CADASTRO).toHaveLength(11);
    expect(TIPOS_DO_CADASTRO.some(temPortaPropria)).toBe(false);
  });

  it("o rótulo e a leitura do formulário", () => {
    expect(rotuloDoTipo("ADMINISTRADORA_CARTOES")).toBe("Administradora de cartões");
    expect(rotuloDoTipo("OUTRO")).toBe("Conta");
    expect(tipoDeConta("MUTUO")).toBe(true);
    expect(tipoDeConta("CARTAO")).toBe(false);
    expect(tipoDeConta(undefined)).toBe(false);
  });
});
