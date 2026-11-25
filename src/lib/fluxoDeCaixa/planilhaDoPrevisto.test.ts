import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { gerarPlanilhaDoPrevisto, nomeDoArquivoDoPrevisto, DIAS_NA_PLANILHA, type EntradaDaPlanilha } from "./planilhaDoPrevisto";

const HOJE = "2026-11-25";

function entrada(): EntradaDaPlanilha {
  return {
    empresa: "Empresa Exemplo",
    geradoEm: "25/11/2026 12:15",
    hojeKey: HOJE,
    regras: { diasReceber: 1, diasPagar: 0 },
    contas: [
      { dataDeCaixa: "2026-11-26", vencimento: "2026-11-25", tipo: "A receber", contraparte: "Cliente A", documento: "NF 1", categoriaDoOmie: "Venda de produtos", categoria: "Vendas", centavos: 1000_00 },
      { dataDeCaixa: "2026-11-27", vencimento: "2026-11-27", tipo: "A pagar", contraparte: "Folha", documento: "", categoriaDoOmie: "Salários", categoria: "Folha", centavos: -1500_00 },
      { dataDeCaixa: "2026-12-03", vencimento: "2026-12-03", tipo: "A pagar", contraparte: "Banco", documento: "", categoriaDoOmie: "Transferência", categoria: "Transferências", centavos: -9000_00 },
    ],
    atrasadas: [{ vencimento: "2026-11-10", tipo: "A receber", contraparte: "Cliente B", documento: "", categoriaDoOmie: "Venda de produtos", categoria: "Vendas", centavos: 300_00 }],
    linhaDaCategoria: new Map([
      ["Vendas", "recebimentos"],
      ["Folha", "pessoal"],
      ["Transferências", "fora"],
    ]),
    omieDaCategoria: new Map([["Folha", ["Salários", "FGTS"]]]),
    saldos: [{ conta: "Banco A", centavos: 200_00 }],
    origemDoSaldo: "do Omie",
  };
}

async function abrir(): Promise<ExcelJS.Workbook> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load((await gerarPlanilhaDoPrevisto(entrada())) as unknown as ArrayBuffer);
  return livro;
}

/** A linha cujo texto da coluna A é este. */
function linhaDe(ws: ExcelJS.Worksheet, texto: string, coluna = 1): number {
  let achada = -1;
  ws.eachRow((row, n) => {
    if (achada === -1 && row.getCell(coluna).value === texto) achada = n;
  });
  return achada;
}

const resultado = (c: ExcelJS.Cell) => (c.value as { result?: unknown }).result;

describe("Excel do previsto", () => {
  it("traz as abas na ordem da planilha do cliente", async () => {
    const livro = await abrir();
    expect(livro.worksheets.map((w) => w.name)).toEqual([
      "Painel",
      "Leia-me",
      "13 semanas",
      "12 meses",
      "Dia a dia",
      "Lançamentos",
      "Atrasados",
      "Saldos",
      "De-para",
    ]);
  });

  it("a base tem a linha do fluxo puxada do De-para por fórmula, com o valor gravado", async () => {
    const ws = (await abrir()).getWorksheet("Lançamentos")!;
    expect(ws.getCell("H3").value).toBe("Folha");
    expect((ws.getCell("I3").value as { formula: string }).formula).toBe(`IFERROR(INDEX('De-para'!$B:$B,MATCH(H3,'De-para'!$A:$A,0)),"Outras despesas operacionais")`);
    expect(resultado(ws.getCell("I3"))).toBe("Despesas com pessoal");
    expect(ws.getCell("J3").value).toBe(-1500);
    expect(ws.getCell("A2").value).toBe(1);
  });

  it("as 13 semanas somam por SOMASES, e o saldo encadeia a partir do Painel", async () => {
    const ws = (await abrir()).getWorksheet("13 semanas")!;
    const r = linhaDe(ws, "Despesas com pessoal");
    const c = ws.getCell(r, 3);
    expect((c.value as { formula: string }).formula).toContain(`SUMIFS('Lançamentos'!$J:$J,'Lançamentos'!$I:$I,$A${r}`);
    expect(resultado(c)).toBe(-1500);
    // A categoria fica recolhida debaixo da linha.
    const rc = linhaDe(ws, "Folha", 2);
    expect(rc).toBe(r + 1);
    expect(ws.getRow(rc).outlineLevel).toBe(1);
    expect(ws.getRow(rc).hidden).toBe(true);
    const inicial = linhaDe(ws, "Saldo inicial");
    expect((ws.getCell(inicial, 3).value as { formula: string }).formula).toBe("'Painel'!$B$4");
    const final = linhaDe(ws, "Saldo final");
    // 200 + 1.000 − 1.500 na primeira semana; a transferência fica fora.
    expect(resultado(ws.getCell(final, 3))).toBe(-300);
    expect(resultado(ws.getCell(final, 4))).toBe(-300);
  });

  it("o Dia a dia tem um ano de colunas, e o Painel acha o menor saldo nele", async () => {
    const livro = await abrir();
    const dias = livro.getWorksheet("Dia a dia")!;
    expect(dias.getCell(4, 3 + DIAS_NA_PLANILHA - 1).value).toBe("25/11");
    const painel = livro.getWorksheet("Painel")!;
    expect(resultado(painel.getCell("B4"))).toBe(200);
    expect(resultado(painel.getCell("B5"))).toBe(-300);
    expect(resultado(painel.getCell("B6"))).toEqual(new Date("2026-11-27T00:00:00Z"));
    expect(resultado(painel.getCell("B7"))).toBe(DIAS_NA_PLANILHA - 2);
    expect(resultado(painel.getCell("B9"))).toBe(300);
    expect((painel.getCell("B4").value as { formula: string }).formula).toBe("'Saldos'!$B$3");
  });

  it("o nome do arquivo não leva caractere que o Windows recusa", () => {
    expect(nomeDoArquivoDoPrevisto('Empresa / "Teste"', HOJE)).toBe("Fluxo de caixa previsto - Empresa Teste - 25-11-2026.xlsx");
  });
});
