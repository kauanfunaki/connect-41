import { describe, expect, it } from "vitest";
import { centavos, leitorDaApuracao, leitorDaClassificacao, lerTexto, livroFiscal, naturezaDoAjuste } from "./arquivoIcms";
import { ARQUIVO_ICMS_DE_TESTE } from "./arquivoIcms.fixture";

// Os números esperados saíram dos módulos do SPED Generator rodados sobre o
// mesmo arquivo (`analise_classificacao`, `analise_apuracao`, `demonstrativo_icms`).

describe("centavos", () => {
  it("lê o valor do SPED com vírgula decimal", () => {
    expect(centavos("1234,56")).toBe(123456);
    expect(centavos("18,00")).toBe(1800);
    expect(centavos("0,5")).toBe(50);
    expect(centavos("1000")).toBe(100000);
    expect(centavos("-0,30")).toBe(-30);
    expect(centavos("")).toBe(0);
    expect(centavos(undefined)).toBe(0);
    expect(centavos("1,125")).toBe(113);
  });
});

describe("classificação", () => {
  const r = lerTexto(ARQUIVO_ICMS_DE_TESTE, leitorDaClassificacao());

  it("lê a competência, o CNPJ e o catálogo", () => {
    expect(r.competencia).toBe("2026-09");
    expect(r.cnpj).toBe("17122471000175");
    expect(r.totalItens).toBe(4);
    expect(r.semTipo).toBe(1);
    expect(r.icmsSimples).toBe(24000);
  });

  it("agrupa por CFOP e destinação, do maior ICMS para o menor", () => {
    expect(r.porCfop.map((g) => [g.cfop, g.tipoItem, g.itens, g.ocorrencias, g.valor, g.icms])).toEqual([
      ["1653", "10", 1, 2, 150000, 27000],
      ["2126", "10", 1, 1, 200000, 24000],
      ["2551", "99", 1, 1, 30000, 3600],
      ["1556", "07", 1, 1, 50000, 0],
    ]);
  });

  it("lista todos os produtos, do maior valor para o menor, e marca o Simples pelo CSOSN", () => {
    expect(r.produtos.map((p) => [p.codItem, p.cst, p.simples, p.cfops, p.ocorrencias, p.valor, p.icms])).toEqual([
      ["55666777000188-X", "101", true, ["2126"], 1, 200000, 24000],
      ["11222333000144-A1", "000", false, ["1653"], 2, 150000, 27000],
      ["11222333000144-B7", "040", false, ["1556"], 1, 50000, 0],
      ["55666777000188-Z", "090", false, ["2551"], 1, 30000, 3600],
    ]);
    const diesel = r.produtos.find((p) => p.codItem === "11222333000144-A1")!;
    expect([diesel.cnpjFornecedor, diesel.codProd, diesel.descricao, diesel.ncm]).toEqual(["11222333000144", "A1", "OLEO DIESEL S10", "27101921"]);
  });

  it("para no bloco D", () => {
    const leitor = leitorDaClassificacao();
    const lidas: string[] = [];
    for (const l of ARQUIVO_ICMS_DE_TESTE.split("\r\n")) {
      lidas.push(l);
      if (!leitor.lerLinha(l)) break;
    }
    expect(lidas.at(-1)).toBe("|D001|0|");
  });
});

describe("apuração", () => {
  const a = lerTexto(ARQUIVO_ICMS_DE_TESTE, leitorDaApuracao());

  it("separa entrada e saída pelo IND_OPER do pai", () => {
    const linhas = (g: keyof typeof a.grupos) => a.grupos[g].map((l) => [l.cfop, l.cst, l.aliquota, l.qtd, l.valorOperacao, l.valorBc, l.valorIcms]);
    expect(linhas("saidasCte")).toEqual([["5353", "000", 1200, 1, 1000000, 1000000, 120000], ["5353", "041", 0, 1, 300000, 0, 0]]);
    expect(linhas("saidasNfe")).toEqual([["5102", "000", 1200, 1, 80000, 80000, 9600]]);
    expect(linhas("entradas")).toEqual([
      ["2126", "101", 1200, 1, 200000, 200000, 24000], ["1653", "000", 1800, 2, 150000, 150000, 27000],
      ["1556", "040", 0, 1, 50000, 0, 0], ["2551", "090", 1200, 1, 30000, 30000, 3600],
    ]);
    expect(linhas("entradasCte")).toEqual([["1353", "000", 1200, 1, 40000, 40000, 4800]]);
  });

  it("lê o E110 e os E111 com a natureza pelo código", () => {
    expect(a.nome).toBe("TRANSPORTES EXEMPLO LTDA");
    expect(a.e110?.VL_TOT_DEBITOS).toBe(129600);
    expect(a.e110?.VL_ICMS_RECOLHER).toBe(59200);
    expect(a.ajustes.map((x) => [x.codigo, x.valor, x.natureza])).toEqual([["PR000081", 5000, "debito"], ["PR020222", 2000, "credito"]]);
  });

  it("confere o arquivo como o painel", () => {
    expect(a.conferencias.map((c) => [c.bate, c.esperado, c.obtido])).toEqual([
      [true, 129600, 129600], [false, 63400, 59400], [true, 59200, 59200], [true, 0, 0], [false, 5000, 7000], [false, 0, 3600],
    ]);
    expect(a.temDivergencia).toBe(true);
  });
});

describe("livro fiscal", () => {
  const livro = livroFiscal(lerTexto(ARQUIVO_ICMS_DE_TESTE, leitorDaApuracao()));

  it("agrega por CFOP e alíquota, com isentas e outras pelo CST", () => {
    const quadro = (ls: typeof livro.saidas) => ls.map((l) => [l.cfop, l.aliquota, l.valorContabil, l.baseCalculo, l.imposto, l.isentas, l.outras]);
    expect(quadro(livro.saidas)).toEqual([["5102", 1200, 80000, 80000, 9600, 0, 0], ["5353", 0, 300000, 0, 0, 300000, 0], ["5353", 1200, 1000000, 1000000, 120000, 0, 0]]);
    expect(quadro(livro.entradas)).toEqual([
      ["1353", 1200, 40000, 40000, 4800, 0, 0], ["1556", 0, 50000, 0, 0, 50000, 0], ["1653", 1800, 150000, 150000, 27000, 0, 0],
      ["2126", 1200, 200000, 200000, 24000, 0, 0], ["2551", 1200, 30000, 30000, 3600, 0, 0],
    ]);
    expect(livro.totalSaidas.valorContabil).toBe(1380000);
  });

  it("monta débitos, créditos e apuração com a abertura dos ajustes", () => {
    expect(livro.debitos.map((v) => [v.descricao, v.valor])).toEqual([
      ["Débitos pelas saídas", 129600], ["Outros débitos", 5000], ["PR000081 — DIFERENCIAL DE ALIQUOTA", 5000], ["Estorno de créditos", 0], ["Total de débitos", 134600],
    ]);
    expect(livro.creditos.at(-1)).toEqual({ descricao: "Total de créditos", valor: 65400, total: true });
    expect(livro.apuracao.find((v) => v.descricao === "ICMS a recolher")?.valor).toBe(59200);
  });
});

describe("natureza do ajuste", () => {
  it("vem da 4ª posição do código e erra para débito", () => {
    expect(naturezaDoAjuste("PR012000")).toBe("estorno_credito");
    expect(naturezaDoAjuste("PR039999")).toBe("estorno_debito");
    expect(naturezaDoAjuste("PR")).toBe("debito");
  });
});
