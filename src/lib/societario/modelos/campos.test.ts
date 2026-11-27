import { describe, expect, it } from "vitest";
import {
  camposEmBranco,
  dadosDoDocumento,
  dataPorExtenso,
  enderecoEmLinha,
  inteiroPorExtenso,
  juntarComE,
  nomeDoArquivoGerado,
  qualificacaoDaPessoa,
  qualificacaoDoSocio,
  reaisPorExtenso,
  type EntradaDoDocumento,
  type SocioDoDocumento,
} from "./campos";

// Os campos dos modelos do Societário (funcionalidade-891, 27/11/2026). Dados
// inventados: nada de cliente.

const endereco = { logradouro: "Rua das Flores", numero: "120", complemento: "sala 4", bairro: "Centro", cidade: "Curitiba", uf: "pr", cep: "80010000" };
const semEndereco = { logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, cep: null };

const socio = (sobre: Partial<SocioDoDocumento> = {}): SocioDoDocumento => ({
  nome: "João Souza",
  documento: "12345678909",
  qualificacao: "Sócio-Administrador",
  administrador: true,
  nacionalidade: "brasileiro",
  estadoCivil: "casado",
  profissao: "empresário",
  endereco: semEndereco,
  quotas: 5000,
  capital: 5000,
  percentual: 50,
  saiu: false,
  ...sobre,
});

const entrada = (sobre: Partial<EntradaDoDocumento> = {}): EntradaDoDocumento => ({
  empresa: {
    razaoSocial: "Empresa Exemplo Ltda",
    nomeFantasia: null,
    cnpj: "11222333000181",
    nire: null,
    naturezaJuridica: "206-2 - Sociedade Empresária Limitada",
    cnaePrincipal: "6920-6/01",
    cnaesSecundarios: "6911-7/01,8211-3/00",
    inscricaoEstadual: null,
    inscricaoMunicipal: null,
    dataDeAbertura: null,
    endereco,
  },
  socios: [socio(), socio({ nome: "Ana Lima", documento: "98765432100", administrador: false, quotas: 5000, capital: 5000 })],
  processo: { numero: 12, tipo: "Alteração contratual", titulo: null },
  advogado: null,
  testemunha1: null,
  testemunha2: null,
  ...sobre,
});

const AGORA = new Date("2026-11-27T15:00:00Z");

describe("por extenso", () => {
  it("inteiros: e, vírgula, mil sem o um", () => {
    expect(inteiroPorExtenso(0)).toBe("zero");
    expect(inteiroPorExtenso(1)).toBe("um");
    expect(inteiroPorExtenso(16)).toBe("dezesseis");
    expect(inteiroPorExtenso(21)).toBe("vinte e um");
    expect(inteiroPorExtenso(100)).toBe("cem");
    expect(inteiroPorExtenso(101)).toBe("cento e um");
    expect(inteiroPorExtenso(1000)).toBe("mil");
    expect(inteiroPorExtenso(1100)).toBe("mil e cem");
    expect(inteiroPorExtenso(1210)).toBe("mil, duzentos e dez");
    expect(inteiroPorExtenso(2030)).toBe("dois mil e trinta");
    expect(inteiroPorExtenso(1250300)).toBe("um milhão, duzentos e cinquenta mil e trezentos");
    expect(inteiroPorExtenso(3000000)).toBe("três milhões");
  });
  it("reais e centavos", () => {
    expect(reaisPorExtenso(10000)).toBe("dez mil reais");
    expect(reaisPorExtenso(1)).toBe("um real");
    expect(reaisPorExtenso(1234.5)).toBe("mil, duzentos e trinta e quatro reais e cinquenta centavos");
    expect(reaisPorExtenso(0.01)).toBe("um centavo");
    expect(reaisPorExtenso(1000000)).toBe("um milhão de reais");
    expect(reaisPorExtenso(0)).toBe("zero real");
  });
});

describe("textos", () => {
  it("endereço numa linha, só com o que existe", () => {
    expect(enderecoEmLinha(endereco)).toBe("Rua das Flores, nº 120, sala 4, Bairro Centro, Curitiba/PR, CEP 80010-000");
    expect(enderecoEmLinha({ ...semEndereco, cidade: "Curitiba" })).toBe("Curitiba");
    expect(enderecoEmLinha(semEndereco)).toBe("");
  });
  it("qualificação do sócio pessoa física e jurídica", () => {
    expect(qualificacaoDoSocio(socio({ endereco }))).toBe(
      "JOÃO SOUZA, brasileiro, casado, empresário, CPF 123.456.789-09, residente e domiciliado na Rua das Flores, nº 120, sala 4, Bairro Centro, Curitiba/PR, CEP 80010-000"
    );
    expect(qualificacaoDoSocio(socio({ nome: "Holding Exemplo Ltda", documento: "11222333000181", nacionalidade: null }))).toBe(
      "HOLDING EXEMPLO LTDA, pessoa jurídica inscrita no CNPJ sob o nº 11.222.333/0001-81"
    );
    expect(qualificacaoDoSocio(socio({ nacionalidade: null, estadoCivil: null, profissao: null, documento: null }))).toBe("JOÃO SOUZA");
  });
  it("qualificação do advogado", () => {
    expect(
      qualificacaoDaPessoa({ nome: "Maria Silva", cpf: "12345678909", rg: null, oab: "OAB/PR 12.345", nacionalidade: "brasileira", estadoCivil: null, profissao: "advogada", endereco: null })
    ).toBe("MARIA SILVA, brasileira, advogada, inscrito na OAB/PR 12.345, CPF 123.456.789-09");
  });
  it("juntar com e", () => {
    expect(juntarComE([])).toBe("");
    expect(juntarComE(["A"])).toBe("A");
    expect(juntarComE(["A", "B", "C"])).toBe("A, B e C");
  });
  it("data por extenso em São Paulo, com 1º no primeiro dia", () => {
    expect(dataPorExtenso(AGORA)).toBe("27 de novembro de 2026");
    expect(dataPorExtenso(new Date("2026-12-01T02:00:00Z"))).toBe("30 de novembro de 2026");
    expect(dataPorExtenso(new Date("2026-12-01T12:00:00Z"))).toBe("1º de dezembro de 2026");
  });
});

describe("dados do modelo", () => {
  it("empresa, capital somado dos que estão e lista de sócios", () => {
    const d = dadosDoDocumento(entrada({ socios: [socio(), socio({ nome: "Ana Lima", documento: "98765432100", administrador: true }), socio({ nome: "Pedro Saiu", documento: "11144477735", saiu: true })] }), AGORA);
    expect(d.EMPRESA_RAZAO_SOCIAL).toBe("EMPRESA EXEMPLO LTDA");
    expect(d.EMPRESA_CNPJ).toBe("11.222.333/0001-81");
    expect(d.EMPRESA_CNAES_SECUNDARIOS).toBe("6911-7/01, 8211-3/00");
    expect(d.EMPRESA_UF).toBe("PR");
    expect(d.CAPITAL_SOCIAL).toMatch(/^R\$\s10\.000,00$/);
    expect(d.CAPITAL_SOCIAL_EXTENSO).toBe("dez mil reais");
    expect(d.TOTAL_QUOTAS).toBe("10.000");
    expect(d.ADMINISTRADORES).toBe("JOÃO SOUZA e ANA LIMA");
    expect((d.SOCIOS as Record<string, string>[]).map((s) => s.NOME)).toEqual(["JOÃO SOUZA", "ANA LIMA"]);
    expect((d.SOCIOS_QUE_SAIRAM as Record<string, string>[]).map((s) => s.NOME)).toEqual(["PEDRO SAIU"]);
    expect((d.SOCIOS as Record<string, string>[])[0]!.PERCENTUAL).toBe("50%");
    expect(d.LOCAL_E_DATA).toBe("Curitiba, 27 de novembro de 2026");
    expect(d.PROCESSO_NUMERO).toBe("12");
  });
  it("sem capital informado, o capital sai em branco, e não R$ 0,00", () => {
    const d = dadosDoDocumento(entrada({ socios: [socio({ capital: null, quotas: null })] }), AGORA);
    expect(d.CAPITAL_SOCIAL).toBe("");
    expect(d.TOTAL_QUOTAS).toBe("");
  });
  it("advogado e testemunhas vazios quando não escolhidos", () => {
    const d = dadosDoDocumento(entrada(), AGORA);
    expect(d.ADVOGADO_NOME).toBe("");
    expect(d.ADVOGADO_OAB).toBe("");
    expect(d.TESTEMUNHA2_TEXTO).toBe("");
  });
  it("campos em branco: só os que o modelo usa", () => {
    const d = dadosDoDocumento(entrada({ socios: [] }), AGORA);
    expect(camposEmBranco(["EMPRESA_RAZAO_SOCIAL", "EMPRESA_NIRE", "SOCIOS", "NOME", "ADVOGADO_NOME"], d)).toEqual(["NIRE", "Sócios na sociedade", "Nome do advogado"]);
    expect(camposEmBranco(["EMPRESA_CNPJ"], d)).toEqual([]);
  });
  it("nome do arquivo sem acento nem símbolo", () => {
    expect(nomeDoArquivoGerado("Alteração contratual", "Empresa Exemplo Ltda.", 12)).toBe("Alteracao_contratual_EMPRESA_EXEMPLO_LTDA_processo-12.docx");
  });
});
