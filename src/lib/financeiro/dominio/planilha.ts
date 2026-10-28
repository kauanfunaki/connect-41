// A planilha de importação de lançamentos da Domínio (fila do BPO, 21/10) —
// o mesmo layout que o SPED Generator já gera na tela Contábil e que o
// Contábil importa (`webapp/routers/contabil.py`, `COLUNAS_MODELO`,
// `_xlsx_modelo` e `_txt_modelo`). Mudar algo aqui é mudar o que a Domínio
// recebe: confira com o Contábil, e com o SPED Generator, antes.
//
// Os detalhes copiados de lá de propósito:
// - a aba "Planilha1", com a linha de cabeçalho;
// - a data como texto "AAAA-MM-DD" (é o que o SPED Generator grava, e a
//   Domínio já importa assim);
// - o valor como número; as contas, o histórico e a filial como texto;
// - o .txt separado por ";", CRLF no fim de toda linha, em ISO-8859-1, o valor
//   com vírgula e duas casas, sem aspas.

import ExcelJS from "exceljs";

export const COLUNAS_DA_DOMINIO = [
  "Data",
  "Cód. Conta Debito",
  "Cód. Conta Credito",
  "Valor",
  "Cód. Histórico",
  "Complemento Histórico",
  "Inicia Lote",
  "Código Matriz/Filial",
  "Centro de Custo Débito",
  "Centro de Custo Crédito",
] as const;

/** Uma linha da planilha, já com as contas no código reduzido da Domínio. */
export type LinhaDaDominio = {
  /** "AAAA-MM-DD". */
  dataKey: string;
  debito: string;
  credito: string;
  centavos: number;
  codigoHistorico: string;
  complemento: string;
  codigoFilial: string;
  /** A baixa que gerou a linha (28/10/2026): é por ela que a correção compara. Não vai no arquivo. */
  baixaId?: string;
};

function celulas(l: LinhaDaDominio): (string | number)[] {
  return [l.dataKey, l.debito, l.credito, l.centavos / 100, l.codigoHistorico, l.complemento, "", l.codigoFilial, "", ""];
}

/** O .xlsx do modelo da Domínio, em bytes. */
export async function xlsxDaDominio(linhas: readonly LinhaDaDominio[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const aba = wb.addWorksheet("Planilha1");
  aba.addRow([...COLUNAS_DA_DOMINIO]);
  for (const l of linhas) aba.addRow(celulas(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Latin-1 com "?" no que não cabe — o `errors="replace"` do Python. */
function latin1(texto: string): Buffer {
  const b = Buffer.alloc(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    b[i] = c <= 0xff ? c : 0x3f;
  }
  return b;
}

/** O .txt delimitado do modelo da Domínio, em ISO-8859-1. */
export function txtDaDominio(linhas: readonly LinhaDaDominio[]): Buffer {
  const campo = (v: string | number) => (typeof v === "number" ? v.toFixed(2).replace(".", ",") : v.replace(/[;\r\n]/g, " "));
  const corpo = [COLUNAS_DA_DOMINIO.join(";"), ...linhas.map((l) => celulas(l).map(campo).join(";"))].join("\r\n") + "\r\n";
  return latin1(corpo);
}

/** O código reduzido de uma conta da Domínio: só dígitos. */
export function contaReduzidaValida(texto: string): string | null {
  const t = texto.trim();
  return /^\d{1,10}$/.test(t) ? t : null;
}
