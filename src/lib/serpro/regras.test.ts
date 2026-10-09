import { describe, expect, it } from "vitest";
import {
  cabeNoTeto,
  CONTAGEM_VAZIA,
  corpoDoPedido,
  custoDoMes,
  explicarErro,
  foiCobrada,
  lerResposta,
  lerSujeitoDoCertificado,
  lerTeto,
  pedidoDeProcuracao,
  resultadoDaConferencia,
} from "./regras";

describe("o que o Serpro cobra", () => {
  it("cobra 200, 202 e 403 em Consultar, Emitir e Declarar; nunca em Apoiar e Monitorar", () => {
    for (const s of [200, 202, 403]) expect(foiCobrada("Consultar", s), String(s)).toBe(true);
    for (const s of [204, 304, 400, 401, 404, 429, 500, 503, 504]) expect(foiCobrada("Emitir", s), String(s)).toBe(false);
    expect(foiCobrada("Apoiar", 200)).toBe(false);
    expect(foiCobrada("Monitorar", 200)).toBe(false);
    expect(foiCobrada("Declarar", null)).toBe(false);
  });
});

describe("o custo do mês", () => {
  it("cada tipo inteiro pelo preço da faixa que atingiu", () => {
    const c = custoDoMes({ CONSULTA: 300, EMISSAO: 400, DECLARACAO: 400 });
    expect(c.porTipo.CONSULTA).toEqual({ quantidade: 300, faixa: 1, centavos: 24, totalCentavos: 7200 });
    expect(c.porTipo.EMISSAO).toEqual({ quantidade: 400, faixa: 1, centavos: 32, totalCentavos: 12800 });
    expect(c.porTipo.DECLARACAO).toEqual({ quantidade: 400, faixa: 2, centavos: 36, totalCentavos: 14400 });
    // O cenário A do estudo: 400 clientes do Simples, R$ 356.
    expect(custoDoMes({ CONSULTA: 400, EMISSAO: 400, DECLARACAO: 400 }).totalCentavos).toBe(35600);
  });

  it("a 301ª consulta derruba o preço das 300 de antes (faixa cheia)", () => {
    expect(custoDoMes({ ...CONTAGEM_VAZIA, CONSULTA: 300 }).totalCentavos).toBe(7200);
    expect(custoDoMes({ ...CONTAGEM_VAZIA, CONSULTA: 301 }).totalCentavos).toBe(6321);
    expect(custoDoMes({ ...CONTAGEM_VAZIA, CONSULTA: 40_000 }).porTipo.CONSULTA.faixa).toBe(8);
  });

  it("o teto conta a próxima chamada junto com o mês", () => {
    expect(cabeNoTeto({ ...CONTAGEM_VAZIA, CONSULTA: 9 }, "CONSULTA", 240)).toEqual({ cabe: true, depois: 240 });
    expect(cabeNoTeto({ ...CONTAGEM_VAZIA, CONSULTA: 10 }, "CONSULTA", 240)).toEqual({ cabe: false, depois: 264 });
  });

  it("lê o teto em reais", () => {
    expect(lerTeto("400")).toBe(40000);
    expect(lerTeto("R$ 1.250,50")).toBe(125050);
    expect(lerTeto("80,5")).toBe(8050);
    expect(lerTeto("0")).toBeNull();
    expect(lerTeto("quatrocentos")).toBeNull();
    expect(lerTeto("")).toBeNull();
  });
});

describe("o pedido e a resposta", () => {
  it("monta o corpo com os tipos de pessoa e o `dados` como texto", () => {
    const p = pedidoDeProcuracao("11.222.333/0001-81", "98765432000198");
    expect(corpoDoPedido(p, "98765432000198", "98765432000198")).toEqual({
      contratante: { numero: "98765432000198", tipo: 2 },
      autorPedidoDados: { numero: "98765432000198", tipo: 2 },
      contribuinte: { numero: "11222333000181", tipo: 2 },
      pedidoDados: {
        idSistema: "PROCURACOES",
        idServico: "OBTERPROCURACAO41",
        versaoSistema: "1",
        dados: '{"outorgante":"11222333000181","tipoOutorgante":"2","outorgado":"98765432000198","tipoOutorgado":"2"}',
      },
    });
    expect(pedidoDeProcuracao("529.982.247-25", "98765432000198").dados).toMatchObject({ outorgante: "52998224725", tipoOutorgante: "1" });
  });

  it("desembrulha o `dados` que vem como texto e junta as mensagens", () => {
    const r = lerResposta(200, JSON.stringify({ status: 200, dados: '[{"a":1}]', mensagens: [{ codigo: "[Sucesso-X]", texto: "ok" }] }));
    expect(r).toEqual({ status: 200, dados: [{ a: 1 }], mensagens: [{ codigo: "[Sucesso-X]", texto: "ok" }] });
    expect(lerResposta(502, "<html>Bad gateway</html>")).toEqual({ status: 502, dados: null, mensagens: [] });
  });

  it("explica os erros que custam dinheiro", () => {
    expect(explicarErro(403, [{ codigo: "[AcessoNegado-ICGERENCIADOR-022]", texto: "" }])).toMatch(/não tem autorização de acesso/);
    expect(explicarErro(403, [{ codigo: "[AcessoNegado-ICGERENCIADOR-016]", texto: "" }])).toMatch(/certificado/);
    expect(explicarErro(504, [])).toMatch(/não cobrada/);
    expect(explicarErro(null, [])).toMatch(/não respondeu/);
  });
});

describe("o certificado", () => {
  it("lê titular e CNPJ do CN do e-CNPJ", () => {
    expect(lerSujeitoDoCertificado("C=BR\nO=ICP-Brasil\nCN=ESCRITORIO MODELO LTDA:11222333000181")).toEqual({
      titular: "ESCRITORIO MODELO LTDA",
      cnpj: "11222333000181",
    });
    expect(lerSujeitoDoCertificado("CN=Teste\nOU=11222333000181")).toEqual({ titular: "Teste", cnpj: "11222333000181" });
    expect(lerSujeitoDoCertificado("CN=Sem documento")).toEqual({ titular: "Sem documento", cnpj: null });
  });
});

describe("a conferência das procurações", () => {
  const HOJE = "2026-10-09";
  it("ativa: a validade mais distante entre as que não venceram", () => {
    const r = lerResposta(
      200,
      JSON.stringify({
        dados: JSON.stringify([
          { dtexpiracao: "20301231", nrsistemas: 2, sistemas: ["Caixa Postal", "DCTFWeb"] },
          { dtexpiracao: "20280101", nrsistemas: 1, sistemas: ["PGDAS-D"] },
          { dtexpiracao: "20250101", nrsistemas: 1, sistemas: ["Antiga"] },
        ]),
        mensagens: [{ codigo: "[Aviso-PROCURACOES-20001]", texto: "" }],
      })
    );
    expect(resultadoDaConferencia(r, HOJE)).toEqual({ tipo: "ativa", expiraEm: "2030-12-31", sistemas: 3 });
  });

  it("sem procuração: o aviso 40400, ou só procurações vencidas", () => {
    expect(resultadoDaConferencia(lerResposta(404, JSON.stringify({ mensagens: [{ codigo: "[Aviso-PROCURACOES-40400]", texto: "Não possui procuração ativa." }] })), HOJE)).toEqual({
      tipo: "sem_procuracao",
    });
    expect(resultadoDaConferencia(lerResposta(200, JSON.stringify({ dados: '[{"dtexpiracao":"20200101"}]' })), HOJE)).toEqual({ tipo: "sem_procuracao" });
  });

  it("erro: diz o porquê", () => {
    const r = resultadoDaConferencia(lerResposta(403, JSON.stringify({ mensagens: [{ codigo: "[AcessoNegado-PROCURACOES-40300]", texto: "Procurador diferente do Autor do pedido." }] })), HOJE);
    expect(r).toEqual({ tipo: "erro", texto: "Acesso negado pelo Serpro (cobrado): Procurador diferente do Autor do pedido." });
  });
});
