import { describe, expect, it } from "vitest";
import {
  centrosDosDepartamentos,
  lerCategorias,
  lerDepartamentos,
  mapearBaixasDoTitulo,
  mapearMovimento,
  mensagemDoFinanceiro,
  paginaDeCategorias,
  paginaDeDepartamentos,
  paginaDeMovimentos,
  rateioDoMovimento,
  type TituloDoOmie,
} from "./financeiro";

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
      numeroDocumento: "123/1",
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

  it("pagamento parcial fica em aberto e marcado, com o principal pago e o dia do último pagamento", () => {
    const r = mapearMovimento(mov({ cStatus: "PAGTO_PARCIAL", dDtPagamento: "20/09/2026" }, { resumo: { cLiquidado: "N", nValPago: 500, nJuros: 3 } }));
    expect("fora" in r ? r : [r.situacao, r.parcial, r.pagoCentavos, r.pagamento, r.ultimoPagamento?.toISOString()]).toEqual([
      "ABERTO",
      true,
      50_000,
      null,
      "2026-09-20T15:00:00.000Z",
    ]);
  });

  it("o pago tem o valor inteiro pago; o aberto, nada", () => {
    const pago = mapearMovimento(mov({ cStatus: "PAGO", dDtPagamento: "16/09/2026" }, { resumo: { cLiquidado: "S" } }));
    expect("fora" in pago ? pago : [pago.pagoCentavos, pago.ultimoPagamento?.toISOString()]).toEqual([150_050, "2026-09-16T15:00:00.000Z"]);
    const aberto = mapearMovimento(mov());
    expect("fora" in aberto ? aberto : [aberto.pagoCentavos, aberto.ultimoPagamento]).toEqual([0, null]);
  });

  it("cancelado", () => {
    const r = mapearMovimento(mov({ cStatus: "CANCELADO" }));
    expect("fora" in r ? r : r.situacao).toBe("CANCELADO");
  });

  it("título sem rateio: categoria do título e nenhuma linha", () => {
    const r = mapearMovimento(mov()) as TituloDoOmie;
    expect([r.categoriaCodigo, r.rateio, r.rateioIlegivel, r.departamentoCodigo]).toEqual(["2.01.03", [], false, null]);
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

  it("conta corrente e previsão do título (20/10)", () => {
    const r = mapearMovimento(mov({ nCodCC: 4455667, dDtPrevisao: "20/09/2026" }));
    expect("fora" in r ? r : [r.contaCorrenteId, r.previsao?.toISOString()]).toEqual(["4455667", "2026-09-20T15:00:00.000Z"]);
  });

  it("sem conta corrente nem previsão no Omie: nulas, e o título entra igual", () => {
    const r = mapearMovimento(mov());
    expect("fora" in r ? r : [r.omieTitleId, r.contaCorrenteId, r.previsao]).toEqual(["555001", null, null]);
    for (const nCodCC of [0, "0", "", null]) {
      const s = mapearMovimento(mov({ nCodCC }));
      expect("fora" in s ? s : s.contaCorrenteId).toBeNull();
    }
  });

  it("previsão nula quando é o vencimento, fora do formato ou a conta não está em aberto", () => {
    const previsao = (detalhes: Record<string, unknown>, resto?: Record<string, unknown>) => {
      const r = mapearMovimento(mov({ dDtPrevisao: "20/09/2026", ...detalhes }, resto));
      return "fora" in r ? r : r.previsao;
    };
    expect(previsao({ dDtPrevisao: "15/09/2026" })).toBeNull();
    expect(previsao({ dDtPrevisao: "2026-09-20" })).toBeNull();
    expect(previsao({ cStatus: "PAGO", dDtPagamento: "16/09/2026" })).toBeNull();
    expect(previsao({ cStatus: "CANCELADO" })).toBeNull();
    // A parcial continua em aberto: o resto ainda tem quando andar.
    const parcial = previsao({ cStatus: "PAGTO_PARCIAL", dDtPagamento: "10/09/2026" }, { resumo: { cLiquidado: "N", nValPago: 500 } });
    expect(parcial instanceof Date ? parcial.toISOString() : parcial).toBe("2026-09-20T15:00:00.000Z");
  });
});

// O formato visto numa resposta real em 20/10 (uma empresa cliente, com `cExibirDepartamentos: "S"`).
const cat = (cCodCateg: string, nDistrValor: number, nDistrPercentual = 0) => ({ cCodCateg, nDistrPercentual, nDistrValor, nValorFixo: "N" });
const dep = (cCodDepartamento: string, nDistrPercentual: number, nDistrValor: number) => ({ cCodDepartamento, nDistrPercentual, nDistrValor, nValorFixo: "N" });
const soma = (linhas: { centavos: number }[]) => linhas.reduce((s, l) => s + l.centavos, 0);

describe("rateio do título (20/10)", () => {
  it("duas categorias: uma linha cada, somando o título, e a categoria da linha maior no resumo", () => {
    // No título rateado, o cCodCateg vem com um código que não é nenhuma das linhas.
    const r = mapearMovimento(mov({ cCodCateg: "1.01.99" }, { categorias: [cat("2.01.01", 500.25, 33.34), cat("2.05.02", 1000.25, 66.66)] })) as TituloDoOmie;
    expect(r.rateio).toEqual([
      { categoriaCodigo: "2.01.01", departamentoCodigo: null, centavos: 50025 },
      { categoriaCodigo: "2.05.02", departamentoCodigo: null, centavos: 100025 },
    ]);
    expect(r.categoriaCodigo).toBe("2.05.02");
  });

  it("valores que não fecham o título: o centavo fecha pelo maior resto", () => {
    const r = rateioDoMovimento({ categorias: [cat("A", 333.33), cat("B", 333.33), cat("C", 333.33)] }, 100000, "X");
    expect(r.linhas.map((l) => l.centavos)).toEqual([33334, 33333, 33333]);
    expect(soma(r.linhas)).toBe(100000);
  });

  it("sem valor nas linhas, reparte pelo percentual", () => {
    const r = rateioDoMovimento({ categorias: [{ cCodCateg: "A", nDistrPercentual: 25 }, { cCodCateg: "B", nDistrPercentual: 75 }] }, 10001, null);
    expect(r.linhas.map((l) => [l.categoriaCodigo, l.centavos])).toEqual([
      ["A", 2500],
      ["B", 7501],
    ]);
  });

  it("uma categoria e um departamento não é rateio: o departamento vai na conta", () => {
    const r = mapearMovimento(mov({}, { departamentos: [dep("4459988001", 100, 1500.5)] })) as TituloDoOmie;
    expect([r.categoriaCodigo, r.rateio, r.departamentoCodigo]).toEqual(["2.01.03", [], "4459988001"]);
  });

  it("um departamento num rateio de categorias vai em todas as linhas", () => {
    const r = rateioDoMovimento({ categorias: [cat("A", 60), cat("B", 40)], departamentos: [dep("D1", 100, 100)] }, 10000, null);
    expect(r.linhas).toEqual([
      { categoriaCodigo: "A", departamentoCodigo: "D1", centavos: 6000 },
      { categoriaCodigo: "B", departamentoCodigo: "D1", centavos: 4000 },
    ]);
    // Rateado, o departamento mora nas linhas, e não na conta.
    expect(r.departamentoCodigo).toBeNull();
  });

  it("uma categoria e dois departamentos: uma linha por departamento, na categoria do título", () => {
    const r = rateioDoMovimento({ departamentos: [dep("D1", 70, 70), dep("D2", 30, 30)] }, 10000, "2.01.03");
    expect(r.linhas).toEqual([
      { categoriaCodigo: "2.01.03", departamentoCodigo: "D1", centavos: 7000 },
      { categoriaCodigo: "2.01.03", departamentoCodigo: "D2", centavos: 3000 },
    ]);
    expect(r.categoriaCodigo).toBe("2.01.03");
  });

  it("duas categorias e dois departamentos: o cruzamento, com a soma de cada categoria exata", () => {
    const r = rateioDoMovimento({ categorias: [cat("A", 600.01), cat("B", 399.99)], departamentos: [dep("D1", 50, 500), dep("D2", 50, 500)] }, 100000, null);
    expect(r.linhas.map((l) => `${l.categoriaCodigo}/${l.departamentoCodigo}=${l.centavos}`)).toEqual(["A/D1=30001", "A/D2=30000", "B/D1=20000", "B/D2=19999"]);
    expect(soma(r.linhas.filter((l) => l.categoriaCodigo === "A"))).toBe(60001);
    expect(soma(r.linhas)).toBe(100000);
    expect(r.categoriaCodigo).toBe("A");
  });

  it("código repetido soma numa linha; linha sem código ou sem valor sai", () => {
    const r = rateioDoMovimento({ categorias: [cat("A", 30), cat("B", 50), cat("A", 20), cat("", 5), cat("C", 0)] }, 10000, null);
    expect(r.linhas.map((l) => [l.categoriaCodigo, l.centavos])).toEqual([
      ["A", 5000],
      ["B", 5000],
    ]);
  });

  it("lista sem valor nem percentual: ilegível, e o título fica na categoria dele", () => {
    const r = mapearMovimento(mov({}, { categorias: [{ cCodCateg: "A" }, { cCodCateg: "B" }] })) as TituloDoOmie;
    expect([r.rateio, r.categoriaCodigo, r.rateioIlegivel]).toEqual([[], "2.01.03", true]);
  });

  it("uma categoria só na lista vale mais que a do título", () => {
    expect(rateioDoMovimento({ categorias: [cat("2.05.02", 100)] }, 10000, "1.01.99")).toEqual({
      linhas: [],
      categoriaCodigo: "2.05.02",
      departamentoCodigo: null,
      ilegivel: false,
    });
  });

  it("lê também os nomes da documentação antiga (nValor) e os do ListarContasPagar", () => {
    const antigo = rateioDoMovimento({ categorias: [{ cCodCateg: "A", nValor: 10 }, { cCodCateg: "B", nValor: 30 }] }, 4000, null);
    const contas = rateioDoMovimento(
      { categorias: [{ codigo_categoria: "A", valor: 10 }, { codigo_categoria: "B", valor: 30 }], departamentos: [{ cCodDep: "D1", nValDep: 40 }] },
      4000,
      null
    );
    expect(antigo.linhas.map((l) => l.centavos)).toEqual([1000, 3000]);
    expect(contas.linhas.map((l) => l.departamentoCodigo)).toEqual(["D1", "D1"]);
  });

  it("linha que arredonda para zero sai, e sobrando uma não é rateio — com o departamento dela na conta", () => {
    expect(rateioDoMovimento({ categorias: [cat("A", 1000), cat("B", 0.001)], departamentos: [dep("D1", 100, 1000)] }, 100000, "X")).toEqual({
      linhas: [],
      categoriaCodigo: "A",
      departamentoCodigo: "D1",
      ilegivel: false,
    });
  });
});

describe("departamentos", () => {
  const departamentos = lerDepartamentos(
    paginaDeDepartamentos({
      pagina: 1,
      total_de_paginas: 1,
      departamentos: [
        { codigo: "4459988001", descricao: "Loja Centro", estrutura: "001", inativo: "N" },
        { codigo: "4459988002", descricao: "Administração", estrutura: "002", inativo: "N" },
        { codigo: "4459988003", descricao: "Obra 12", estrutura: "003", inativo: "S" },
        { codigo: "4459988004", descricao: "Sem par", estrutura: "004", inativo: "N" },
        { codigo: "", descricao: "Sem código", estrutura: "", inativo: "N" },
      ],
    }).itens
  );

  it("lê a lista do ListarDepartamentos", () => {
    expect(departamentos.map((d) => [d.codigo, d.nome, d.estrutura, d.inativo])).toEqual([
      ["4459988001", "Loja Centro", "001", false],
      ["4459988002", "Administração", "002", false],
      ["4459988003", "Obra 12", "003", true],
      ["4459988004", "Sem par", "004", false],
    ]);
  });

  it("casa com o centro pelo código, pela estrutura ou pelo nome sem acento nem caixa", () => {
    const mapa = centrosDosDepartamentos(departamentos, [
      { id: "c-loja", name: "Loja do centro", code: "4459988001" },
      { id: "c-adm", name: "ADMINISTRACAO", code: null },
      { id: "c-obra", name: "Outra", code: "003" },
    ]);
    expect(Object.fromEntries(mapa)).toEqual({ "4459988001": "c-loja", "4459988002": "c-adm", "4459988003": "c-obra" });
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
      "10 movimentos lidos em 1 página(s): 7 contas entrariam, 1 seriam atualizadas, 1 com pagamento parcial (em aberto, com o que já foi pago), 2 sem título (lançamentos de conta corrente)."
    );
    expect(mensagemDoFinanceiro(c, true)).toContain("7 contas novas, 1 atualizadas");
  });

  it("conta os rateados e as linhas sem centro ou sem categoria", () => {
    const m = mensagemDoFinanceiro(
      { lidos: 4, paginas: 1, novos: 4, rateados: 2, rateio_departamento_sem_centro: 3, rateio_linhas_sem_categoria: 1, rateio_ilegivel: 1 },
      true
    );
    expect(m).toContain("2 rateadas no Omie (as linhas do rateio vêm junto)");
    expect(m).toContain("3 linhas de rateio com departamento do Omie sem centro de custo de mesmo nome ou código no Connect (ficam sem centro)");
    expect(m).toContain("1 linhas de rateio sem categoria");
    expect(m).toContain("1 com rateio sem valor nem percentual no Omie (ficam numa categoria só)");
    expect(mensagemDoFinanceiro({ lidos: 2, paginas: 1, novos: 2, departamento_sem_centro: 2 }, true)).toContain(
      "2 com departamento do Omie sem centro de custo de mesmo nome ou código no Connect (ficam sem centro)"
    );
  });

  it("avisa dos títulos com conta corrente do Omie que não tem par no Connect", () => {
    expect(mensagemDoFinanceiro({ lidos: 4, paginas: 1, novos: 4, conta_prevista_sem_par: 3 }, true)).toContain(
      "3 com conta corrente do Omie sem conta bancária ligada no Connect (ficam sem conta prevista)"
    );
  });
});

describe("mapearBaixasDoTitulo", () => {
  const bx = (nCodBaixa: unknown, dia: string, valor: number, titulo: unknown = 555001) => ({
    detalhes: { nCodTitulo: titulo, nCodBaixa, dDtPagamento: dia, nValorMovCC: -valor },
    resumo: { nValPago: 999 },
  });

  it("uma baixa por pagamento, em ordem de dia, pelo valor do movimento", () => {
    expect(mapearBaixasDoTitulo({ movimentos: [bx(902, "20/10/2026", 400), bx(901, "05/10/2026", 300)] }, "555001")).toEqual([
      { chave: "901", principalCentavos: 30_000, paidAt: new Date("2026-10-05T15:00:00.000Z") },
      { chave: "902", principalCentavos: 40_000, paidAt: new Date("2026-10-20T15:00:00.000Z") },
    ]);
  });

  it("linha de outro título fica de fora; a mesma baixa repetida conta uma vez", () => {
    expect(mapearBaixasDoTitulo({ movimentos: [bx(901, "05/10/2026", 300), bx(901, "05/10/2026", 300), bx(777, "06/10/2026", 50, 1)] }, "555001")).toEqual([
      { chave: "901", principalCentavos: 30_000, paidAt: new Date("2026-10-05T15:00:00.000Z") },
    ]);
  });

  it("sem código, dia ou valor numa linha: null — o pago vai numa baixa só", () => {
    expect(mapearBaixasDoTitulo({ movimentos: [bx(0, "05/10/2026", 300)] }, "555001")).toBeNull();
    expect(mapearBaixasDoTitulo({ movimentos: [bx(901, "", 300)] }, "555001")).toBeNull();
    expect(mapearBaixasDoTitulo({ movimentos: [bx(901, "05/10/2026", 0)] }, "555001")).toBeNull();
  });
});
