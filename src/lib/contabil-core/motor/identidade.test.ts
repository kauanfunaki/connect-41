import { describe, expect, test } from "vitest";
import { bancoCanonico, conferirIdentidade, identidadeDoOfx, numero } from "./identidade";

const OFX = (bloco: string) => `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>${bloco}<BANKTRANLIST></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const conta = { bancoSigla: "SICOOB", agencia: "1234", numero: "98765", digito: "4" };

describe("identidade do extrato OFX", () => {
  test("banco por código ou sigla, com ou sem acento", () => {
    expect(bancoCanonico("0756")).toBe("sicoob");
    expect(bancoCanonico("Itaú")).toBe("itau");
    expect(bancoCanonico("341")).toBe("itau");
    expect(bancoCanonico("Banco Desconhecido")).toBe("BANCO DESCONHECIDO");
  });

  test("número sem zeros à esquerda, pontuação e com X de dígito", () => {
    expect(numero("0001.234-x")).toBe("1234X");
    expect(numero("")).toBe("0");
  });

  test("lê BANKID, BRANCHID e ACCTID e acusa mais de uma conta", () => {
    expect(identidadeDoOfx(OFX("<BANKACCTFROM><BANKID>0756<BRANCHID>1234<ACCTID>98765-4</BANKACCTFROM>"))).toEqual({
      banco: "0756",
      agencia: "1234",
      conta: "98765-4",
      multiplasContas: false,
    });
    const dois = "<BANKACCTFROM><BANKID>1<ACCTID>2</BANKACCTFROM><BANKACCTFROM><BANKID>1<ACCTID>3</BANKACCTFROM>";
    expect(identidadeDoOfx(OFX(dois)).multiplasContas).toBe(true);
    expect(identidadeDoOfx("sem cabeçalho de conta")).toEqual({ banco: null, agencia: null, conta: null, multiplasContas: false });
  });

  test("tudo confere: COMPATIVEL; conta com dígito colado também", () => {
    expect(conferirIdentidade({ banco: "756", agencia: "1234", conta: "98765-4", multiplasContas: false }, conta).estado).toBe("COMPATIVEL");
    expect(conferirIdentidade({ banco: "756", agencia: "1234", conta: "987654", multiplasContas: false }, conta).estado).toBe("COMPATIVEL");
  });

  test("conta sem dígito no arquivo: não dá para conferir o dígito, pede confirmação", () => {
    expect(conferirIdentidade({ banco: "756", agencia: "1234", conta: "98765", multiplasContas: false }, conta).estado).toBe("CONFIRMAR");
  });

  test("arquivo que não diz o banco pede confirmação", () => {
    expect(conferirIdentidade({ banco: null, agencia: "1234", conta: "98765-4", multiplasContas: false }, conta).estado).toBe("CONFIRMAR");
  });

  test("outro banco, outra agência ou outra conta: DIVERGENTE, com a frase de cada um", () => {
    const r = conferirIdentidade({ banco: "341", agencia: "9999", conta: "11111-1", multiplasContas: false }, conta);
    expect(r.estado).toBe("DIVERGENTE");
    expect(r.mensagens).toEqual([
      "Banco do arquivo: 341; cadastrado: SICOOB.",
      "Agência do arquivo: 9999; cadastrada: 1234.",
      "Conta do arquivo: 11111-1; cadastrada: 98765-4.",
    ]);
  });

  test("dígito diferente é outra conta", () => {
    expect(conferirIdentidade({ banco: "756", agencia: "1234", conta: "98765-5", multiplasContas: false }, conta).estado).toBe("DIVERGENTE");
  });
});
