import { describe, expect, it } from "vitest";
import { lerCategorias, mapearMovimento, mensagemDoFinanceiro, paginaDeCategorias, paginaDeMovimentos } from "./financeiro";

function mov(detalhes: Record<string, unknown> = {}, resto: Record<string, unknown> = {}) {
  return {
    detalhes: {
      nCodTitulo: 555001,
      cNumTitulo: "123/1",
      dDtEmissao: "30/08/2026",
      dDtVenc: "15/09/2026",
      dDtPagamento: "",
      nCodCliente: 9001,
      cCPFCNPJCliente: "12.345.678/0001-90",
      cNatureza: "P",
      cStatus: "AVENCER",
      nValorTitulo: 1500.5,
      cCodCateg: "2.01.03",
      cNumDocFiscal: "6014",
      ...detalhes,
    },
    resumo: { cLiquidado: "N", nValPago: 0, nValAberto: 1500.5 },
    ...resto,
  };
}

describe("mapearMovimento", () => {
  it("conta a pagar em aberto", () => {
    const r = mapearMovimento(mov());
    expect(r).toMatchObject({
      omieTitleId: "555001",
      kind: "PAGAR",
      situacao: "ABERTO",
      parcial: false,
      pagamento: null,
      competencia: "2026-08",
      valor: 1500.5,
      categoriaCodigo: "2.01.03",
      contraparteDocumento: "12345678000190",
      descricao: "Título 123/1 · NF 6014",
    });
    expect("fora" in r ? null : r.vencimento.toISOString()).toBe("2026-09-15T15:00:00.000Z");
  });

  it("recebido vira pago, com a data do pagamento", () => {
    const r = mapearMovimento(mov({ cNatureza: "R", cStatus: "RECEBIDO", dDtPagamento: "16/09/2026" }, { resumo: { cLiquidado: "S" } }));
    expect("fora" in r ? r : [r.kind, r.situacao, r.pagamento?.toISOString()]).toEqual(["RECEBER", "PAGO", "2026-09-16T15:00:00.000Z"]);
  });

  it("liquidado sem status de pago também é pago", () => {
    const r = mapearMovimento(mov({ cStatus: "ATRASADO", dDtPagamento: "20/09/2026" }, { resumo: { cLiquidado: "S" } }));
    expect("fora" in r ? r : r.situacao).toBe("PAGO");
  });

  it("pago sem data não entra — sem data não há caixa", () => {
    expect(mapearMovimento(mov({ cStatus: "PAGO" }))).toEqual({ fora: "pago_sem_data" });
  });

  it("pagamento parcial fica em aberto e marcado", () => {
    const r = mapearMovimento(mov({ cStatus: "PAGTO_PARCIAL" }, { resumo: { cLiquidado: "N", nValPago: 500 } }));
    expect("fora" in r ? r : [r.situacao, r.parcial]).toEqual(["ABERTO", true]);
  });

  it("cancelado", () => {
    const r = mapearMovimento(mov({ cStatus: "CANCELADO" }));
    expect("fora" in r ? r : r.situacao).toBe("CANCELADO");
  });

  it("sem categoria no título, usa a de maior valor do rateio", () => {
    const r = mapearMovimento(
      mov({ cCodCateg: "" }, { categorias: [{ cCodCateg: "2.01.01", nValor: 100 }, { cCodCateg: "2.05.02", nValor: 1400.5 }] })
    );
    expect("fora" in r ? r : r.categoriaCodigo).toBe("2.05.02");
  });

  it("deixa de fora o que não é conta", () => {
    expect(mapearMovimento(mov({ nCodTitulo: 0 }))).toEqual({ fora: "sem_titulo" });
    expect(mapearMovimento(mov({ cNatureza: "X" }))).toEqual({ fora: "natureza" });
    expect(mapearMovimento(mov({ dDtVenc: "" }))).toEqual({ fora: "sem_vencimento" });
    expect(mapearMovimento(mov({ nValorTitulo: 0 }))).toEqual({ fora: "sem_valor" });
  });

  it("sem emissão, competência pelo vencimento", () => {
    const r = mapearMovimento(mov({ dDtEmissao: "" }));
    expect("fora" in r ? r : r.competencia).toBe("2026-09");
  });

  it("documento que não é CPF nem CNPJ fica nulo, o código do cliente fica", () => {
    const r = mapearMovimento(mov({ cCPFCNPJCliente: "" }));
    expect("fora" in r ? r : [r.contraparteDocumento, r.contraparteCodigo]).toEqual([null, "9001"]);
  });
});

describe("categorias", () => {
  it("pega o nome do grupo pela totalizadora de cima, e deixa a totalizadora de fora", () => {
    const itens = [
      { codigo: "2.01", descricao: "Despesas Administrativas", totalizadora: "S", conta_despesa: "S" },
      { codigo: "2.01.03", descricao: "Energia Elétrica", categoria_superior: "2.01", conta_despesa: "S", conta_receita: "N" },
      { codigo: "1.01.01", descricao: "Vendas de Produtos", categoria_superior: "1.01", conta_receita: "S", conta_inativa: "S" },
    ];
    expect(lerCategorias(itens)).toEqual([
      { codigo: "2.01.03", nome: "Energia Elétrica", grupo: "Despesas Administrativas", kind: "PAGAR", inativa: false },
      { codigo: "1.01.01", nome: "Vendas de Produtos", grupo: null, kind: "RECEBER", inativa: true },
    ]);
  });

  it("lê as páginas pelo nome do campo ou pela primeira lista", () => {
    expect(paginaDeCategorias({ total_de_paginas: 2, categoria_cadastro: [1] })).toEqual({ itens: [1], totalDePaginas: 2 });
    expect(paginaDeMovimentos({ nTotPaginas: 3, movimentos: [1, 2] })).toEqual({ itens: [1, 2], totalDePaginas: 3 });
    expect(paginaDeMovimentos({ outraLista: [7] })).toEqual({ itens: [7], totalDePaginas: 1 });
  });
});

describe("mensagemDoFinanceiro", () => {
  it("diz o que entraria na prévia e o que entrou na gravação", () => {
    const c = { lidos: 10, paginas: 1, novos: 7, atualizados: 1, parciais: 1, fora_sem_titulo: 2 };
    expect(mensagemDoFinanceiro(c, false)).toBe(
      "10 movimentos lidos em 1 página(s): 7 contas entrariam, 1 seriam atualizadas, 1 com pagamento parcial (ficam em aberto), 2 sem título (lançamentos de conta corrente)."
    );
    expect(mensagemDoFinanceiro(c, true)).toContain("7 contas novas, 1 atualizadas");
  });
});
