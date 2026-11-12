import { describe, expect, it } from "vitest";
import { dataDoDocumento, dadosDoModelo, nomeDoArquivo, oQueFalta, podeGerar, textoDoContratante, type DadosDoContratante, type EnderecoDoTermo } from "./contratante";

const vazio: EnderecoDoTermo = { logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null, cep: null };
const endereco = (extra: Partial<EnderecoDoTermo> = {}): EnderecoDoTermo => ({
  logradouro: "Rua das Flores",
  numero: "100",
  complemento: null,
  bairro: "Centro",
  cidade: "Curitiba",
  uf: "pr",
  cep: "80010000",
  ...extra,
});

// CNPJ e CPF de exemplo, com dígito verificador válido.
const minimo: DadosDoContratante = {
  razaoSocial: "Empresa Exemplo Ltda",
  cnpj: "11222333000181",
  endereco: vazio,
  socio: { nome: "Fulano de Tal", cpf: "52998224725", nacionalidade: null, estadoCivil: null, profissao: null, endereco: vazio },
  administrativo: null,
  financeiro: null,
};

describe("o parágrafo do contratante (a redação do Aditiva Pronto)", () => {
  it("só com o obrigatório: sem vírgula solta nem bloco pela metade", () => {
    expect(textoDoContratante(minimo)).toBe(
      "Empresa Exemplo Ltda, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 11.222.333/0001-81, neste ato representado por seu Sócio Administrador Fulano de Tal, portador do CPF 529.982.247-25."
    );
  });

  it("completo: endereços, dados do sócio e os dois contatos, terminando em ponto e vírgula", () => {
    const t = textoDoContratante({
      ...minimo,
      endereco: endereco({ complemento: "sala 4" }),
      socio: { ...minimo.socio!, nacionalidade: "brasileiro", estadoCivil: "casado", profissao: "empresário", endereco: endereco({ logradouro: "Av. Brasil", numero: "5" }) },
      administrativo: { nome: "Ana", telefone: "41999998888", email: "ana@exemplo.com.br" },
      financeiro: { nome: "Bia", telefone: "4133334444", email: "bia@exemplo.com.br" },
    });
    expect(t).toContain(", estabelecida na Rua das Flores, n° 100, sala 4, Bairro Centro – Curitiba/PR, CEP 80010-000,");
    expect(t).toContain("Fulano de Tal, brasileiro, casado, empresário, portador do CPF 529.982.247-25");
    expect(t).toContain(", residente e domiciliado na Av. Brasil, n° 5, Bairro Centro, Cidade Curitiba – PR, CEP 80010-000.");
    expect(t).toContain("Contato administrativo: Ana (41) 99999-8888, E-mail: ana@exemplo.com.br. Contato financeiro: Bia (41) 3333-4444, E-mail: bia@exemplo.com.br;");
  });

  it("bloco incompleto fica de fora inteiro", () => {
    const t = textoDoContratante({
      ...minimo,
      endereco: endereco({ bairro: " " }),
      socio: { ...minimo.socio!, nacionalidade: "brasileiro", estadoCivil: null, profissao: "empresário" },
      administrativo: { nome: "Ana", telefone: null, email: "ana@exemplo.com.br" },
    });
    expect(t).not.toContain("estabelecida");
    expect(t).not.toContain("brasileiro");
    expect(t).not.toContain("Contato");
  });
});

describe("o que falta para gerar", () => {
  it("sem sócio ou com CPF inválido não gera; o resto é recomendação", () => {
    expect(podeGerar(minimo)).toBe(true);
    expect(podeGerar({ ...minimo, socio: null })).toBe(false);
    expect(podeGerar({ ...minimo, socio: { ...minimo.socio!, cpf: "11111111111" } })).toBe(false);
    expect(podeGerar({ ...minimo, cnpj: null })).toBe(false);
    expect(oQueFalta(minimo).map((f) => f.campo)).toEqual([
      "Endereço completo da empresa",
      "Nacionalidade, estado civil e profissão do sócio",
      "Endereço completo do sócio",
      "Contato administrativo (nome, telefone e e-mail)",
      "Contato financeiro (nome, telefone e e-mail)",
    ]);
  });
});

describe("os campos do modelo", () => {
  it("data em São Paulo, por extenso, com a cidade do escritório", () => {
    // 23h de São Paulo já é o dia seguinte em UTC: vale o dia daqui.
    expect(dataDoDocumento("Curitiba", new Date("2026-05-06T02:00:00Z"))).toBe("Curitiba, 05 de maio de 2026.");
  });

  it("assinatura em caixa alta e nome do arquivo sem acento", () => {
    const d = dadosDoModelo(minimo, "Curitiba", new Date("2026-11-12T15:00:00Z"));
    expect(d.NOME_SOCIO_ASSINATURA).toBe("FULANO DE TAL");
    expect(nomeDoArquivo("Ação & Cia. Ltda", "11.222.333/0001-81")).toBe("Termo_Aditivo_ACAO_CIA_LTDA_11222333000181.docx");
  });
});
