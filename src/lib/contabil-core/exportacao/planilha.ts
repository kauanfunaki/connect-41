// O XLSX das exportações (Bloco D, Fase D1, 26/11/2026): porte de `_new_workbook` e `_dicts_to_xlsx`
// (`src/domain/exportacao/formatos.py`), com o exceljs no lugar do openpyxl.
//
// Uma folha com o nome do tipo; a primeira linha são os nomes das colunas, em negrito; depois, uma linha
// por registro, na ordem das colunas. Como o `ws.append` do openpyxl:
// - o texto passa pela `celulaSegura` (fórmula vinda de um histórico não pode ser executada no Excel);
// - texto vazio não é gravado (no Excel, a célula fica vazia);
// - dinheiro sai como número (`Decimal` vira o número do texto exato, o mesmo double que o Excel lê);
// - o retorno de carro (`\r`) vai escapado como `_x000D_`, a forma do OOXML: escrito cru, a leitura do XML o
//   trocaria por quebra de linha, e o Excel veria outro texto (o openpyxl o preserva).
// O gabarito compara o CONTEÚDO lido de volta (valores, tipos, negrito, folha), não os bytes: o exceljs e o
// openpyxl escrevem o XML de jeitos diferentes.

import ExcelJS from "exceljs";
import { texto, type Dec } from "../motor/decimal";
import { celulaSegura, type Linha } from "../motor/dominio";

const NEGRITO: Partial<ExcelJS.Font> = { bold: true };

export async function planilhaDasLinhas(linhas: readonly Linha[], colunas: readonly string[], folha: string): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(folha);
  const cabecalho = ws.getRow(1);
  colunas.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1);
    const v = celulaSegura(c);
    if (v !== "") cel.value = v;
    cel.font = NEGRITO;
  });
  linhas.forEach((linha, k) => {
    const row = ws.getRow(k + 2);
    colunas.forEach((coluna, i) => {
      const v = celulaSegura(linha[coluna] ?? "");
      if (typeof v === "string") {
        if (v !== "") row.getCell(i + 1).value = v.replace(/\r/g, "_x000D_");
      } else {
        row.getCell(i + 1).value = Number(texto(v as Dec));
      }
    });
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
