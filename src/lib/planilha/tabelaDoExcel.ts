// Uma planilha com os dados numa Tabela do Excel (20/10/2026 — "exportação em
// Excel, como o Omie", para o usuário montar a tabela dinâmica dele).
//
// Tabela do Excel, e não células soltas: com o cabeçalho e o filtro de cada
// coluna já prontos, "Inserir › Tabela dinâmica" pega o intervalo sozinho, e
// a tabela cresce se alguém colar mais linhas. As células vão com o tipo
// certo — data como data, valor como número —, que é o que deixa a tabela
// dinâmica agrupar por mês e somar. Texto vai como texto: o Excel não avalia
// "=…" numa célula de texto, então nome de fornecedor não vira fórmula.

import ExcelJS from "exceljs";

/** "data": "AAAA-MM-DD"; "mes": "AAAA-MM"; "reais": centavos; "inteiro": número. */
export type TipoDaColuna = "texto" | "data" | "mes" | "reais" | "inteiro";

export type ColunaDaTabela = { nome: string; tipo: TipoDaColuna; largura?: number };

export type CelulaDaTabela = string | number | null;

export type AbaDaTabela = {
  /** O nome da aba (até 31 caracteres). */
  aba: string;
  /** O nome da Tabela do Excel: letras, números e "_", começando por letra. */
  tabela: string;
  colunas: ColunaDaTabela[];
  linhas: CelulaDaTabela[][];
  /** O que a aba diz quando não há linha nenhuma — a Tabela do Excel não nasce vazia. */
  semLinhas?: string;
};

export type PlanilhaDeTabelas = {
  abas: AbaDaTabela[];
  /** A aba "Filtros": o que foi exportado, em pares de rótulo e valor. */
  filtros?: [string, string][];
};

export const FORMATO_DE_REAIS = "#,##0.00";
const FORMATO: Record<TipoDaColuna, string | undefined> = {
  texto: undefined,
  data: "dd/mm/yyyy",
  mes: "mm/yyyy",
  reais: FORMATO_DE_REAIS,
  inteiro: "0",
};
const LARGURA: Record<TipoDaColuna, number> = { texto: 24, data: 12, mes: 10, reais: 14, inteiro: 10 };

/** O nome de uma Tabela do Excel a partir de um texto qualquer. */
export function nomeDeTabela(texto: string): string {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[A-Za-z]/.test(limpo) ? limpo.slice(0, 200) : `T_${limpo}`.slice(0, 200);
}

/**
 * O valor da célula no tipo do Excel. Data e mês viram `Date` em UTC — o
 * Excel não tem fuso, e a meia-noite UTC é o dia exato no arquivo.
 */
export function valorDaCelula(valor: CelulaDaTabela, tipo: TipoDaColuna): string | number | Date | null {
  if (valor === null || valor === "") return null;
  if (tipo === "data" || tipo === "mes") {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(valor));
    if (!m) return String(valor);
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, tipo === "mes" ? 1 : Number(m[3] ?? 1)));
  }
  if (tipo === "reais") return typeof valor === "number" ? valor / 100 : Number(valor);
  if (tipo === "inteiro") return typeof valor === "number" ? valor : Number(valor);
  return String(valor);
}

function desenharAba(livro: ExcelJS.Workbook, a: AbaDaTabela) {
  const aba = livro.addWorksheet(a.aba.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  a.colunas.forEach((c, i) => {
    const coluna = aba.getColumn(i + 1);
    coluna.width = c.largura ?? LARGURA[c.tipo];
    const formato = FORMATO[c.tipo];
    if (formato) coluna.numFmt = formato;
  });
  if (a.linhas.length === 0) {
    aba.addRow(a.colunas.map((c) => c.nome)).font = { bold: true };
    aba.addRow([a.semLinhas ?? "Nenhuma linha no recorte."]);
    return;
  }
  aba.addTable({
    name: nomeDeTabela(a.tabela),
    ref: "A1",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: a.colunas.map((c) => ({ name: c.nome, filterButton: true })),
    rows: a.linhas.map((linha) => a.colunas.map((c, i) => valorDaCelula(linha[i] ?? null, c.tipo))),
  });
}

/** O arquivo .xlsx: uma aba por tabela e, se houver, a aba "Filtros" no fim. */
export async function gerarPlanilhaDeTabelas(p: PlanilhaDeTabelas): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = "Connect 41";
  livro.created = new Date();
  for (const a of p.abas) desenharAba(livro, a);
  if (p.filtros && p.filtros.length > 0) {
    const aba = livro.addWorksheet("Filtros");
    aba.getColumn(1).width = 22;
    aba.getColumn(2).width = 80;
    for (const [rotulo, valor] of p.filtros) {
      const linha = aba.addRow([rotulo, valor]);
      linha.getCell(1).font = { bold: true };
      linha.getCell(2).alignment = { wrapText: true, vertical: "top" };
    }
  }
  return Buffer.from(await livro.xlsx.writeBuffer());
}

export const TIPO_DO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
