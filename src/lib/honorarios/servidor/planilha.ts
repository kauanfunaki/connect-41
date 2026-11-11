// A planilha dos relatórios (Contratos e Aditivos). No Aditiva Pronto era o
// SheetJS (xlsx); o Connect usa o exceljs. Mesma saída: uma aba, o cabeçalho
// na primeira linha e a largura de cada coluna pelo texto mais longo (até 60).

import ExcelJS from "exceljs";

export type Celula = string | number;

export async function planilhaDeTabela(nomeDaAba: string, cabecalho: string[], linhas: Celula[][]): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  // O Excel recusa nome de aba com mais de 31 caracteres ou com : \ / ? * [ ].
  const aba = livro.addWorksheet(nomeDaAba.replace(/[:\\/?*[\]]/g, " ").slice(0, 31));
  aba.addRow(cabecalho);
  aba.getRow(1).font = { bold: true };
  for (const l of linhas) aba.addRow(l);
  aba.columns.forEach((coluna, i) => {
    const max = Math.max(cabecalho[i]!.length, ...linhas.map((l) => String(l[i] ?? "").length));
    coluna.width = Math.min(max + 2, 60);
  });
  return Buffer.from(await livro.xlsx.writeBuffer());
}
