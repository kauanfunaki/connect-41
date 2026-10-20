import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { LinhaDaConta } from "./data";
import { colunasDasContas, linhasDasContas, xlsxDasContas, type ParteNaPlanilha } from "./exportacaoXlsx";
import { nomeDeTabela, valorDaCelula } from "@/lib/planilha/tabelaDoExcel";

const diaDe = (d: Date) => d.toISOString().slice(0, 10);

function conta(id: string, extra: Partial<LinhaDaConta> = {}): LinhaDaConta {
  return {
    id,
    situacao: "A_VENCER",
    valorCentavos: 100_000,
    vencimentoKey: "2026-10-10",
    vencimento: new Date("2026-10-10T15:00:00Z"),
    previsao: null,
    pagoEm: null,
    competencia: "2026-09",
    descricao: "=SOMA(A1)",
    empresaId: "e1",
    empresaNome: "Alfa",
    contraparteNome: "Fornecedor",
    categoriaNome: "Aluguel",
    rateio: 0,
    status: "CONFERIDO",
    approvalStatus: "NAO_REQUER",
    documentoId: null,
    closeReason: null,
    parcelaDeAcordo: false,
    centroDeCustoId: null,
    centroDeCustoNome: "Loja A",
    projetoNome: null,
    baixadoCentavos: 0,
    numeroDocumento: "123",
    emissao: new Date("2026-09-30T15:00:00Z"),
    ...extra,
  } as LinhaDaConta;
}

describe("linhasDasContas", () => {
  it("uma conta, uma linha, na ordem das colunas", () => {
    const [linha] = linhasDasContas([conta("1", { previsao: new Date("2026-10-20T15:00:00Z") })], { diaDe, rateios: new Map() });
    const colunas = colunasDasContas("PAGAR").map((c) => c.nome);
    const porNome = Object.fromEntries(colunas.map((c, i) => [c, linha![i]]));
    expect(porNome).toMatchObject({
      Vencimento: "2026-10-10",
      Previsão: "2026-10-20",
      Situação: "A vencer",
      Categoria: "Aluguel",
      "Centro de custo": "Loja A",
      "Parte do rateio": null,
      Competência: "2026-09",
      Valor: 100_000,
      Pago: 0,
      Saldo: 100_000,
    });
  });

  it("a conta rateada vira uma linha por parte, com o pago na proporção", () => {
    const partes: ParteNaPlanilha[] = [
      { categoriaNome: "Aluguel", centroNome: "Loja A", projetoNome: null, centavos: 60_000 },
      { categoriaNome: "Água", centroNome: "Loja B", projetoNome: "Obra", centavos: 40_000 },
    ];
    const linhas = linhasDasContas([conta("1", { rateio: 2, baixadoCentavos: 50_000 })], { diaDe, rateios: new Map([["1", partes]]) });
    const i = (nome: string) => colunasDasContas("PAGAR").findIndex((c) => c.nome === nome);
    expect(linhas.map((l) => [l[i("Categoria")], l[i("Centro de custo")], l[i("Parte do rateio")], l[i("Valor")], l[i("Pago")], l[i("Saldo")]])).toEqual([
      ["Aluguel", "Loja A", "1 de 2", 60_000, 30_000, 30_000],
      ["Água", "Loja B", "2 de 2", 40_000, 20_000, 20_000],
    ]);
  });

  it("paga não leva previsão; cancelada não tem saldo", () => {
    const i = (nome: string) => colunasDasContas("PAGAR").findIndex((c) => c.nome === nome);
    const [paga] = linhasDasContas([conta("1", { pagoEm: new Date("2026-10-05T15:00:00Z"), previsao: new Date("2026-10-20T15:00:00Z"), baixadoCentavos: 100_000, situacao: "PAGA" })], {
      diaDe,
      rateios: new Map(),
    });
    expect([paga![i("Previsão")], paga![i("Pago em")], paga![i("Saldo")]]).toEqual([null, "2026-10-05", 0]);
    const [cancelada] = linhasDasContas([conta("2", { situacao: "CANCELADA", closeReason: "PERDA" })], { diaDe, rateios: new Map() });
    expect([cancelada![i("Situação")], cancelada![i("Saldo")]]).toEqual(["Perda", 0]);
  });
});

describe("a planilha", () => {
  it("abre com a Tabela do Excel, células no tipo certo e a aba de filtros", async () => {
    const arquivo = await xlsxDasContas([conta("1"), conta("2", { valorCentavos: 12_345 })], "PAGAR", {
      diaDe,
      rateios: new Map(),
      filtros: [["Empresa", "Alfa"]],
    });
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(arquivo as unknown as ArrayBuffer);
    expect(livro.worksheets.map((w) => w.name)).toEqual(["Contas a pagar", "Filtros"]);
    const aba = livro.getWorksheet("Contas a pagar")!;
    expect(Object.keys((aba as unknown as { tables: Record<string, unknown> }).tables)).toEqual(["ContasAPagar"]);
    expect(aba.getRow(1).getCell(1).value).toBe("Vencimento");
    const venc = aba.getRow(2).getCell(1).value as Date;
    expect(venc).toBeInstanceOf(Date);
    expect(venc.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    const colValor = colunasDasContas("PAGAR").findIndex((c) => c.nome === "Valor") + 1;
    expect(aba.getRow(3).getCell(colValor).value).toBe(123.45);
    // Texto que parece fórmula fica texto.
    const colDescricao = colunasDasContas("PAGAR").findIndex((c) => c.nome === "Descrição") + 1;
    expect(aba.getRow(2).getCell(colDescricao).value).toBe("=SOMA(A1)");
    expect(livro.getWorksheet("Filtros")!.getRow(1).values).toEqual([undefined, "Empresa", "Alfa"]);
  });

  it("sem conta nenhuma, o cabeçalho e o aviso — sem tabela vazia", async () => {
    const arquivo = await xlsxDasContas([], "RECEBER", { diaDe, rateios: new Map(), filtros: [] });
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(arquivo as unknown as ArrayBuffer);
    const aba = livro.getWorksheet("Contas a receber")!;
    expect(aba.getRow(1).getCell(4).value).toBe("Cliente");
    expect(aba.getRow(2).getCell(1).value).toBe("Nenhuma conta no recorte escolhido.");
  });
});

describe("tabelaDoExcel", () => {
  it("nome de tabela válido", () => {
    expect(nomeDeTabela("Contas a pagar")).toBe("Contas_a_pagar");
    expect(nomeDeTabela("2026 visão")).toBe("T_2026_visao");
  });

  it("valores no tipo do Excel", () => {
    expect(valorDaCelula("2026-09", "mes")).toEqual(new Date(Date.UTC(2026, 8, 1)));
    expect(valorDaCelula(12_345, "reais")).toBe(123.45);
    expect(valorDaCelula(null, "data")).toBeNull();
    expect(valorDaCelula("", "texto")).toBeNull();
  });
});
