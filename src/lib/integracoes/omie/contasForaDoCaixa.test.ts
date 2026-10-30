import { describe, expect, it } from "vitest";
import { ladoDoAdiantamento, lerContasCorrentes, lerContasForaDoCaixa } from "./conciliacao";

// As contas do Omie que não são dinheiro da empresa (30/10/2026): os códigos
// de `tipo_conta_corrente` da documentação do ListarContasCorrentes.

const CONTAS = [
  { nCodCC: 11, tipo_conta_corrente: "CC", descricao: "Itaú", codigo_banco: "341", numero_conta_corrente: "12345-6" },
  { nCodCC: 12, tipo_conta_corrente: "CR", descricao: "Cartão Itaú Visa", valor_limite: 15000.5 },
  { nCodCC: 13, tipo_conta_corrente: "AD", descricao: "Adiantamento a Fornecedores" },
  { nCodCC: 14, tipo_conta_corrente: "AD", descricao: "Adiantamento de Clientes" },
  { nCodCC: 15, tipo_conta_corrente: "AD", descricao: "Adiantamentos" },
  { nCodCC: 16, tipo_conta_corrente: "CE", descricao: "Empréstimo BB", inativo: "S" },
  { nCodCC: 17, tipo_conta_corrente: "CX", descricao: "Caixinha" },
  { nCodCC: 18, tipo_conta_corrente: "AC", descricao: "Cielo" },
  { nCodCC: 19, tipo_conta_corrente: "MT", descricao: "Mútuo do sócio" },
  { nCodCC: 20, tipo_conta_corrente: "CN", descricao: "Carnê" },
  { nCodCC: 0, tipo_conta_corrente: "CR", descricao: "sem id" },
];

describe("lerContasForaDoCaixa", () => {
  const lidas = lerContasForaDoCaixa(CONTAS);

  it("traz só as que não são dinheiro da empresa, com o tipo do Connect", () => {
    expect(lidas.map((c) => [c.id, c.tipo])).toEqual([
      ["12", "CARTAO_CREDITO"],
      ["13", "ADIANTAMENTO_FORNECEDOR"],
      ["14", "ADIANTAMENTO_CLIENTE"],
      ["15", null],
      ["16", "EMPRESTIMO"],
      ["18", "ADMINISTRADORA_CARTOES"],
      ["19", "MUTUO"],
      ["20", "CREDIARIO"],
    ]);
  });

  it("o limite do cartão vem em centavos, e só no cartão", () => {
    expect(lidas.find((c) => c.id === "12")?.limiteCentavos).toBe(1_500_050);
    expect(lidas.find((c) => c.id === "13")?.limiteCentavos).toBeNull();
  });

  it("guarda a inativa, para não criar conta nova para ela", () => {
    expect(lidas.find((c) => c.id === "16")?.inativa).toBe(true);
  });

  it("não muda o que a leitura das contas bancárias traz", () => {
    expect(lerContasCorrentes(CONTAS).map((c) => c.id)).toEqual(["11"]);
  });
});

describe("ladoDoAdiantamento", () => {
  it("lê o lado pelo nome, sem acento nem caixa", () => {
    expect(ladoDoAdiantamento("ADIANTAMENTO A FORNECEDORES")).toBe("ADIANTAMENTO_FORNECEDOR");
    expect(ladoDoAdiantamento("Adto. clientes")).toBe("ADIANTAMENTO_CLIENTE");
  });

  it("nome que não diz, ou diz os dois, fica sem lado", () => {
    expect(ladoDoAdiantamento("Adiantamentos")).toBeNull();
    expect(ladoDoAdiantamento("Adiantamento clientes e fornecedores")).toBeNull();
  });
});
