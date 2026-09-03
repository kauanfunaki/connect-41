import { describe, expect, it } from "vitest";
import {
  documentoDaEmpresa,
  podeReceberDocumentoFiscal,
  lerDocumentoFiscal,
  filtroDeCasamento,
  rotuloDoDocumento,
  type EmpresaIdentificavel,
} from "./companyTaxId";

// CNPJ real da matriz da BLD, que está em produção. CPF de teste com dígito
// verificador correto — não é de ninguém.
const CNPJ_OK = "17122471000175";
const CPF_OK = "52998224725";

const pj = (over: Partial<EmpresaIdentificavel> = {}): EmpresaIdentificavel => ({
  kind: "PESSOA_JURIDICA",
  cnpj: CNPJ_OK,
  cpf: null,
  ...over,
});

const pf = (over: Partial<EmpresaIdentificavel> = {}): EmpresaIdentificavel => ({
  kind: "PESSOA_FISICA",
  cnpj: null,
  cpf: CPF_OK,
  ...over,
});

describe("documentoDaEmpresa", () => {
  it("lê o CNPJ da pessoa jurídica", () => {
    expect(documentoDaEmpresa(pj())).toEqual({ tipo: "CNPJ", digitos: CNPJ_OK });
  });

  it("lê o CPF da pessoa física", () => {
    expect(documentoDaEmpresa(pf())).toEqual({ tipo: "CPF", digitos: CPF_OK });
  });

  it("limpa a pontuação do cadastro", () => {
    expect(documentoDaEmpresa(pj({ cnpj: "17.122.471/0001-75" }))).toEqual({
      tipo: "CNPJ",
      digitos: CNPJ_OK,
    });
  });

  // A regra decidida em 2026-09-03, no ponto em que ela é decidida.
  it("empresa sem documento não tem documento fiscal", () => {
    expect(documentoDaEmpresa(pj({ cnpj: null }))).toBeNull();
    expect(documentoDaEmpresa(pf({ cpf: null }))).toBeNull();
  });

  it("documento com dígito verificador errado não vale", () => {
    expect(documentoDaEmpresa(pj({ cnpj: "17122471000174" }))).toBeNull();
    expect(documentoDaEmpresa(pf({ cpf: "52998224724" }))).toBeNull();
  });

  // Cadastro errado tem de aparecer como erro, não ser remendado aqui.
  it("PF com CNPJ preenchido por engano continua sem documento", () => {
    expect(documentoDaEmpresa(pf({ cpf: null, cnpj: CNPJ_OK }))).toBeNull();
  });

  it("PJ com CPF preenchido por engano continua sem documento", () => {
    expect(documentoDaEmpresa(pj({ cnpj: null, cpf: CPF_OK }))).toBeNull();
  });
});

describe("podeReceberDocumentoFiscal", () => {
  it("é falso exatamente quando não há documento válido", () => {
    expect(podeReceberDocumentoFiscal(pj())).toBe(true);
    expect(podeReceberDocumentoFiscal(pf())).toBe(true);
    expect(podeReceberDocumentoFiscal(pj({ cnpj: null }))).toBe(false);
    expect(podeReceberDocumentoFiscal(pj({ cnpj: "000" }))).toBe(false);
  });
});

describe("lerDocumentoFiscal", () => {
  it("classifica pelo tamanho: 14 é CNPJ, 11 é CPF", () => {
    expect(lerDocumentoFiscal(CNPJ_OK)).toEqual({ tipo: "CNPJ", digitos: CNPJ_OK });
    expect(lerDocumentoFiscal(CPF_OK)).toEqual({ tipo: "CPF", digitos: CPF_OK });
  });

  it("aceita o documento formatado como vem de XML de NFS-e municipal", () => {
    expect(lerDocumentoFiscal("529.982.247-25")).toEqual({ tipo: "CPF", digitos: CPF_OK });
  });

  it("tamanho fora de 11 e 14 não vira palpite", () => {
    expect(lerDocumentoFiscal("1712247100017")).toBeNull(); // 13 — um dos inválidos de produção
    expect(lerDocumentoFiscal("171224710001756")).toBeNull();
  });

  it("dígito verificador inválido é tão perigoso quanto nulo", () => {
    expect(lerDocumentoFiscal("11111111111")).toBeNull();
    expect(lerDocumentoFiscal("00000000000000")).toBeNull();
  });

  it("vazio, nulo e indefinido caem no mesmo lugar", () => {
    expect(lerDocumentoFiscal("")).toBeNull();
    expect(lerDocumentoFiscal(null)).toBeNull();
    expect(lerDocumentoFiscal(undefined)).toBeNull();
  });
});

describe("filtroDeCasamento", () => {
  it("manda o documento para a coluna certa", () => {
    expect(filtroDeCasamento({ tipo: "CNPJ", digitos: CNPJ_OK })).toEqual({ cnpj: CNPJ_OK });
    expect(filtroDeCasamento({ tipo: "CPF", digitos: CPF_OK })).toEqual({ cpf: CPF_OK });
  });

  // O ponto do tipo: não existe entrada que produza `{ cnpj: null }`, que no
  // MySQL casaria com toda empresa sem CNPJ do tenant.
  it("nunca produz filtro nulo", () => {
    for (const doc of [
      { tipo: "CNPJ", digitos: CNPJ_OK },
      { tipo: "CPF", digitos: CPF_OK },
    ] as const) {
      expect(Object.values(filtroDeCasamento(doc)).every((v) => typeof v === "string" && v !== "")).toBe(true);
    }
  });
});

describe("rotuloDoDocumento", () => {
  it("dá o nome que a tela mostra", () => {
    expect(rotuloDoDocumento("PESSOA_JURIDICA")).toBe("CNPJ");
    expect(rotuloDoDocumento("PESSOA_FISICA")).toBe("CPF");
  });
});
