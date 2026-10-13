// A DRE no modelo do BPO, desenhada em .xlsx — o visual da aba `DRE FINANCEIRO`
// do modelo (13/10/2026). As linhas e as contas vêm prontas de `modeloDoBpo.ts`;
// aqui é só a cara: cores, bordas, formatos de número, larguras, congelamento.
//
// ─── O que foi copiado do modelo ────────────────────────────────────────────
//
// - Título "DRE REALIZADO" em verde, mesclado sobre as colunas de valor, com
//   borda grossa em cima e embaixo; cabeçalho cinza, em negrito, com 30 de altura.
// - Categoria sem formatação, valor em azul (receita) ou vermelho (despesa), no
//   formato contábil sem centavos.
// - Total de bloco em cinza e negrito, com o "R$" contábil; o percentual dele
//   embaixo, em negrito itálico, com a borda fechando o bloco.
// - Resultados (receita líquida, margem, EBITDA, resultado líquido) em amarelo
//   claro; o último percentual, o do resultado, com o valor em amarelo forte.
// - A faixa preta fina depois da receita líquida; o painel congelado até a
//   receita bruta; folha A4 ajustada a uma página.
//
// ─── O que não foi ──────────────────────────────────────────────────────────
//
// Os acidentes do arquivo: uma célula em Arial 9, dois amarelos soltos no meio
// das despesas, o total de outras receitas sem "R$" e a mistura de negrito com
// negrito itálico entre linhas do mesmo papel. As quarenta colunas pintadas de
// branco à direita, que só escondem a grade, viraram "sem linhas de grade".

import ExcelJS from "exceljs";
import type { LinhaDoModelo, PlanilhaDoModelo } from "@/lib/dre/modeloDoBpo";
import { AVISO_DE_SEM_GRUPO, letraDaColuna } from "@/lib/dre/modeloDoBpo";

// Os formatos de número do modelo, ao pé da letra.
export const FORMATO_INTEIRO = '_-* #,##0_-;-* #,##0_-;_-* "-"??_-;_-@_-';
export const FORMATO_REAIS = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

const COR = {
  verdeDoTitulo: "FF66FF33",
  cinza: "FFD9D9D9",
  amareloClaro: "FFFFFFCC",
  amareloForte: "FFFFFF00",
  preto: "FF000000",
  azul: "FF0070C0",
  vermelho: "FFFF0000",
  abaVerde: "FFA9D08E",
} as const;

const fundo = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const fino: Partial<ExcelJS.Border> = { style: "thin", color: { argb: COR.preto } };
const grosso: Partial<ExcelJS.Border> = { style: "medium", color: { argb: COR.preto } };
const fonte = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: "Calibri", size: 11, ...extra });

export type OpcoesDaPlanilha = {
  /** O nome da empresa, na célula A1 — vazia no modelo, que é de um cliente só. */
  empresa: string;
};

export const NOME_DA_ABA_DRE = "DRE FINANCEIRO";
export const NOME_DA_ABA_CONFERENCIA = "Conferência";

export async function gerarXlsxDoModeloDoBpo(p: PlanilhaDoModelo, opcoes: OpcoesDaPlanilha): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = "Connect 41";
  livro.created = new Date();
  // As fórmulas vão com o valor já calculado; o Excel recalcula ao abrir.
  livro.calcProperties = { fullCalcOnLoad: true };

  desenharDre(livro, p, opcoes);
  desenharConferencia(livro, p);

  return Buffer.from(await livro.xlsx.writeBuffer());
}

function desenharDre(livro: ExcelJS.Workbook, p: PlanilhaDoModelo, opcoes: OpcoesDaPlanilha) {
  const nColunas = p.cabecalho.length;
  const ultima = letraDaColuna(nColunas - 1);
  const umMesSo = nColunas === 1;

  const aba = livro.addWorksheet(NOME_DA_ABA_DRE, {
    properties: { tabColor: { argb: COR.abaVerde }, defaultRowHeight: 14.4 },
    views: [
      {
        state: "frozen",
        // O modelo congela até a receita bruta, que fica à vista enquanto se
        // desce pelas despesas. Com muitas categorias de receita isso tomaria a
        // tela, e aí congela só o cabeçalho.
        ySplit: p.linhaDaReceitaBruta <= 10 ? p.linhaDaReceitaBruta : 2,
        // Doze meses não cabem na tela ao lado dos rótulos: a coluna A fica
        // presa. Um mês só cabe, e fica como no modelo, sem coluna presa.
        xSplit: umMesSo ? 0 : 1,
        showGridLines: false,
      },
    ],
    pageSetup: {
      paperSize: 9,
      orientation: umMesSo ? "portrait" : "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.51, right: 0.51, top: 0.79, bottom: 0.79, header: 0.31, footer: 0.31 },
    },
  });

  aba.getColumn(1).width = 58.66;
  for (let c = 0; c < nColunas; c++) {
    const ehTotal = p.temColunaDeTotal && c === nColunas - 1;
    aba.getColumn(c + 2).width = ehTotal ? 23.66 : umMesSo ? 22.55 : 18;
  }

  // ─── Linha 1: título ──────────────────────────────────────────────────────
  const a1 = aba.getCell("A1");
  a1.value = opcoes.empresa;
  a1.font = fonte({ bold: true });
  a1.fill = fundo(COR.verdeDoTitulo);
  a1.border = { left: grosso, top: grosso, bottom: grosso };
  a1.alignment = { horizontal: "left", vertical: "middle" };
  if (!umMesSo) aba.mergeCells(`B1:${ultima}1`);
  const b1 = aba.getCell("B1");
  b1.value = "DRE REALIZADO";
  for (let c = 0; c < nColunas; c++) {
    const cel = aba.getCell(`${letraDaColuna(c)}1`);
    cel.font = fonte({ bold: true });
    cel.fill = fundo(COR.verdeDoTitulo);
    cel.border = { top: grosso, bottom: grosso, ...(c === nColunas - 1 ? { right: grosso } : {}) };
    cel.alignment = { horizontal: "center", vertical: "middle" };
  }
  aba.getRow(1).height = 15;

  // ─── Linha 2: cabeçalho ───────────────────────────────────────────────────
  const r2 = aba.getRow(2);
  r2.height = 30;
  const a2 = aba.getCell("A2");
  a2.fill = fundo(COR.cinza);
  a2.font = fonte({ bold: true });
  p.cabecalho.forEach((rotulo, c) => {
    const cel = aba.getCell(`${letraDaColuna(c)}2`);
    cel.value = rotulo;
    cel.font = fonte({ bold: true });
    cel.fill = fundo(COR.cinza);
    cel.alignment = { horizontal: "center", vertical: "middle" };
  });

  // ─── O DRE ────────────────────────────────────────────────────────────────
  for (const linha of p.linhas) desenharLinha(aba, linha);

  const ultimaLinha = p.linhas[p.linhas.length - 1]!.numero;
  if (p.temSemGrupo) {
    const aviso = aba.getCell(`A${ultimaLinha + 2}`);
    aviso.value = AVISO_DE_SEM_GRUPO;
    aviso.font = fonte({ italic: true, color: { argb: COR.vermelho } });
  }
  aba.pageSetup.printArea = `A1:${ultima}${ultimaLinha}`;
}

function desenharLinha(aba: ExcelJS.Worksheet, linha: LinhaDoModelo) {
  const r = aba.getRow(linha.numero);
  const a = aba.getCell(`A${linha.numero}`);

  const corDoValor =
    linha.natureza === "despesa"
      ? COR.vermelho
      : linha.natureza === "receita" || linha.codigo === "receita_liquida"
        ? COR.azul
        : COR.preto;

  if (linha.tipo === "separador") {
    r.height = 4.95;
    a.fill = fundo(COR.preto);
    linha.celulas.forEach((_, c) => (aba.getCell(`${letraDaColuna(c)}${linha.numero}`).fill = fundo(COR.preto)));
    return;
  }

  a.value = linha.rotulo;
  a.alignment = { horizontal: "left", vertical: "middle" };

  // Fundo, fonte e borda de cada papel de linha.
  let preenchimento: string | null = null;
  let negrito = false;
  let italico = false;
  let bordaA: Partial<ExcelJS.Borders> = {};
  let bordaValor: Partial<ExcelJS.Borders> = {};
  let formato = FORMATO_INTEIRO;

  switch (linha.tipo) {
    case "categoria":
      break;
    case "total":
      negrito = true;
      formato = FORMATO_REAIS;
      // A receita bruta é o único total sem a faixa cinza no modelo.
      if (linha.codigo !== "receita_bruta") {
        preenchimento = COR.cinza;
        bordaA = bordaValor = { top: fino };
      }
      break;
    case "percentual":
      preenchimento = COR.cinza;
      negrito = italico = true;
      bordaA = bordaValor = { bottom: fino };
      formato = linha.casas === 2 ? "0.00%" : "0%";
      break;
    case "resultado":
      preenchimento = COR.amareloClaro;
      negrito = true;
      formato = FORMATO_REAIS;
      if (linha.codigo === "receita_liquida") {
        r.height = 27.6;
      } else {
        bordaA = { left: fino, top: fino };
        bordaValor = { top: fino };
      }
      break;
    case "percentual_resultado":
      preenchimento = COR.amareloClaro;
      negrito = italico = true;
      bordaA = { left: fino, bottom: fino };
      bordaValor = { bottom: fino };
      formato = "0%";
      break;
  }

  a.font = fonte({ bold: negrito, italic: italico });
  if (preenchimento) a.fill = fundo(preenchimento);
  a.border = bordaA;

  linha.celulas.forEach((celula, c) => {
    const cel = aba.getCell(`${letraDaColuna(c)}${linha.numero}`);
    const resultado =
      celula.centavos !== null ? celula.centavos / 100 : celula.fracao !== null ? celula.fracao : undefined;
    if (celula.formula) {
      const valor: ExcelJS.CellFormulaValue = { formula: celula.formula };
      if (resultado !== undefined) valor.result = resultado;
      cel.value = valor;
    } else {
      cel.value = resultado ?? null;
    }
    cel.numFmt = formato;
    cel.font = fonte({ bold: negrito, italic: italico, color: { argb: corDoValor } });
    // O destaque do fim do relatório: o percentual do resultado em amarelo forte.
    const fundoDaCelula = linha.codigo === "resultado_liquido_pct" ? COR.amareloForte : preenchimento;
    if (fundoDaCelula) cel.fill = fundo(fundoDaCelula);
    cel.border = bordaValor;
    cel.alignment = linha.tipo.startsWith("percentual")
      ? { horizontal: "right", vertical: "middle" }
      : { vertical: "middle" };
  });
}

/**
 * A `Planilha1` do modelo: lá, uma tabela dinâmica do "Valor Pago" por
 * categoria com um `VLOOKUP` ao lado, para achar a categoria que não está na
 * DRE (`#N/A`). Aqui a mesma conferência, com a resposta escrita — onde cada
 * categoria entrou, ou por que ficou de fora.
 */
function desenharConferencia(livro: ExcelJS.Workbook, p: PlanilhaDoModelo) {
  const aba = livro.addWorksheet(NOME_DA_ABA_CONFERENCIA, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  aba.columns = [
    { header: "Categoria", key: "categoria", width: 44 },
    { header: "Origem", key: "origem", width: 14 },
    { header: "Valor no período", key: "valor", width: 20 },
    { header: "Onde entrou no DRE", key: "destino", width: 44 },
  ];
  const cabecalho = aba.getRow(1);
  cabecalho.eachCell((cel) => {
    cel.font = fonte({ bold: true });
    cel.fill = fundo(COR.cinza);
    cel.alignment = { vertical: "middle" };
  });

  for (const l of p.conferencia) {
    const r = aba.addRow({
      categoria: l.categoria,
      origem: l.origem === "pagamento" ? "Pagamento" : "Recebimento",
      valor: l.centavos / 100,
      destino: l.destino,
    });
    r.getCell("valor").numFmt = FORMATO_REAIS;
    if (l.fora) r.getCell("destino").font = fonte({ bold: true, color: { argb: COR.vermelho } });
  }
}
