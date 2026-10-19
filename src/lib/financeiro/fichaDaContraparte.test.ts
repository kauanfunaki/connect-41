import { describe, expect, it } from "vitest";
import {
  lerFichaDaReceita,
  validarFicha,
  completarComReceita,
  fichaOpcional,
  fichaNoFormulario,
  formatarCep,
  type CampoDaFicha,
} from "./fichaDaContraparte";

// A forma da resposta da BrasilAPI (`/api/cnpj/v1/{cnpj}`), só com os campos lidos.
const RESPOSTA = {
  cnpj: "12345678000190",
  razao_social: "GAS FORTE DISTRIBUIDORA LTDA",
  nome_fantasia: "GAS FORTE",
  descricao_situacao_cadastral: "ATIVA",
  email: "FINANCEIRO@GASFORTE.COM.BR",
  ddd_telefone_1: "4133334444",
  ddd_telefone_2: "",
  cep: "80010000",
  descricao_tipo_de_logradouro: "RUA",
  logradouro: "XV DE NOVEMBRO",
  numero: "1000",
  complemento: "SALA 2",
  bairro: "CENTRO",
  municipio: "CURITIBA",
  uf: "PR",
};

const ler = (valores: Partial<Record<CampoDaFicha, string>>) => (campo: CampoDaFicha) => valores[campo] ?? "";

describe("lerFichaDaReceita", () => {
  it("monta a ficha com o tipo do logradouro, telefone e CEP formatados e e-mail minúsculo", () => {
    expect(lerFichaDaReceita(RESPOSTA)).toEqual({
      cnpj: "12345678000190",
      nome: "GAS FORTE DISTRIBUIDORA LTDA",
      fantasia: "GAS FORTE",
      email: "financeiro@gasforte.com.br",
      telefone: "(41) 33334444",
      cep: "80010-000",
      logradouro: "RUA XV DE NOVEMBRO",
      numero: "1000",
      complemento: "SALA 2",
      bairro: "CENTRO",
      cidade: "CURITIBA",
      uf: "PR",
      situacao: "ATIVA",
      ativa: true,
    });
  });

  it("não repete o tipo quando o logradouro já começa com ele", () => {
    expect(lerFichaDaReceita({ ...RESPOSTA, logradouro: "RUA XV DE NOVEMBRO" })?.logradouro).toBe("RUA XV DE NOVEMBRO");
  });

  it("empresa baixada não é ativa — a tela avisa", () => {
    expect(lerFichaDaReceita({ ...RESPOSTA, descricao_situacao_cadastral: "BAIXADA" })).toMatchObject({ situacao: "BAIXADA", ativa: false });
  });

  it("sem situação na resposta não alarma", () => {
    expect(lerFichaDaReceita({ ...RESPOSTA, descricao_situacao_cadastral: undefined })).toMatchObject({ situacao: null, ativa: true });
  });

  it("campos vazios viram nulo, e e-mail inválido some em vez de ir para a ficha", () => {
    const f = lerFichaDaReceita({ ...RESPOSTA, nome_fantasia: "", email: "nao-e-email", ddd_telefone_1: "", cep: "123" });
    expect(f).toMatchObject({ fantasia: null, email: null, telefone: null, cep: null });
  });

  it("o segundo telefone entra quando o primeiro falta", () => {
    expect(lerFichaDaReceita({ ...RESPOSTA, ddd_telefone_1: "", ddd_telefone_2: "41 99998888" })?.telefone).toBe("(41) 99998888");
  });

  it("resposta sem razão social ou sem CNPJ não é ficha", () => {
    expect(lerFichaDaReceita({ ...RESPOSTA, razao_social: "" })).toBeNull();
    expect(lerFichaDaReceita({ message: "CNPJ não encontrado" })).toBeNull();
    expect(lerFichaDaReceita(null)).toBeNull();
  });

  it("corta no tamanho das colunas", () => {
    const f = lerFichaDaReceita({ ...RESPOSTA, razao_social: "x".repeat(300), complemento: "y".repeat(100) });
    expect(f?.nome).toHaveLength(180);
    expect(f?.complemento).toHaveLength(80);
  });
});

describe("validarFicha", () => {
  it("tudo vazio é ficha vazia", () => {
    const v = validarFicha(ler({}));
    expect(v.ok && Object.values(v.dados).every((x) => x === null)).toBe(true);
  });

  it("normaliza CEP, UF e banco de um ou dois dígitos", () => {
    const v = validarFicha(ler({ zipCode: "80010000", stateCode: "pr", bankCode: "1", bankAgency: "1234-5", bankAccount: "12.345-6" }));
    expect(v).toMatchObject({ ok: true, dados: { zipCode: "80010-000", stateCode: "PR", bankCode: "001", bankAgency: "1234-5", bankAccount: "12.345-6" } });
  });

  it("recusa CEP, UF e banco fora da forma", () => {
    expect(validarFicha(ler({ zipCode: "8001" })).ok).toBe(false);
    expect(validarFicha(ler({ stateCode: "Paraná" })).ok).toBe(false);
    expect(validarFicha(ler({ bankCode: "Itaú" })).ok).toBe(false);
    expect(validarFicha(ler({ bankAgency: "ag 12" })).ok).toBe(false);
  });

  it("recusa o que passa da coluna em vez de cortar", () => {
    expect(validarFicha(ler({ tradeName: "x".repeat(181) }))).toMatchObject({ ok: false, erro: expect.stringMatching(/Nome fantasia/) });
  });
});

describe("fichaOpcional", () => {
  it("dado inválido de campo oculto vira ficha vazia, não recusa o lançamento", () => {
    expect(fichaOpcional(ler({ zipCode: "abc", city: "Curitiba" })).city).toBeNull();
    expect(fichaOpcional(ler({ city: "Curitiba" })).city).toBe("Curitiba");
  });
});

describe("completarComReceita", () => {
  it("preenche só o que está vazio — o digitado vale mais que a Receita", () => {
    const ficha = lerFichaDaReceita(RESPOSTA)!;
    const atual = fichaNoFormulario({ phone: "(41) 90000-0000", city: "" });
    const novo = completarComReceita(atual, ficha);
    expect(novo.phone).toBe("(41) 90000-0000");
    expect(novo.city).toBe("CURITIBA");
    expect(novo.tradeName).toBe("GAS FORTE");
    // Banco e PIX a Receita não tem.
    expect(novo.pixKey).toBe("");
  });
});

describe("formatarCep", () => {
  it("só com oito dígitos", () => {
    expect(formatarCep("80.010-000")).toBe("80010-000");
    expect(formatarCep("8001000")).toBeNull();
    expect(formatarCep(null)).toBeNull();
  });
});
