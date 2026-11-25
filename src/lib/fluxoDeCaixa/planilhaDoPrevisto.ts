// O Excel do fluxo previsto (25/11/2026, funcionalidade-837): o mesmo arquivo
// para todos os clientes, no formato da planilha que um cliente do BPO montou —
// painel, 13 semanas, 12 meses, dia a dia, a base de lançamentos e o de-para —
// para o cliente mexer nos dados e ver o efeito.
//
// As visões são FÓRMULAS sobre a aba Lançamentos (SOMASES por linha do fluxo,
// categoria e data de caixa, só das linhas com "Incluir?" = 1), em colunas
// inteiras: linha acrescentada no fim da base entra sozinha, sem limite de
// linhas. A linha do fluxo de cada lançamento vem do De-para por fórmula, então
// trocar a linha de uma categoria lá regrupa tudo. O valor de cada fórmula vai
// gravado junto (calculado aqui, com a mesma regra), para o arquivo abrir com
// os números em qualquer visualizador; o Excel recalcula ao abrir.
//
// Puro (exceljs, sem banco).

import ExcelJS from "exceljs";
import { GRUPOS_DO_FLUXO, LINHAS_DO_FLUXO, rotuloDaLinha } from "./estrutura";
import { periodosDoPrevisto, somarDias, type Periodo } from "./projecao";

export type ContaDaPlanilha = {
  dataDeCaixa: string;
  vencimento: string;
  tipo: "A receber" | "A pagar";
  contraparte: string;
  documento: string;
  categoriaDoOmie: string;
  /** A categoria do cliente, ou a do Omie quando não há de-para. */
  categoria: string;
  /** Centavos, com o sinal: entrada positiva, saída negativa. */
  centavos: number;
};

export type AtrasadaDaPlanilha = Omit<ContaDaPlanilha, "dataDeCaixa">;

export type EntradaDaPlanilha = {
  empresa: string;
  geradoEm: string;
  hojeKey: string;
  regras: { diasReceber: number; diasPagar: number };
  contas: ContaDaPlanilha[];
  atrasadas: AtrasadaDaPlanilha[];
  /** A linha do fluxo (código) de cada categoria que aparece nas contas. */
  linhaDaCategoria: Map<string, string>;
  /** As categorias do Omie de cada categoria do cliente, para quem conferir. */
  omieDaCategoria: Map<string, string[]>;
  saldos: { conta: string; centavos: number }[];
  /** "da conciliação do Connect", "do Omie" ou nulo. */
  origemDoSaldo: string | null;
};

/** Os dias da aba "Dia a dia", como a planilha do cliente. */
export const DIAS_NA_PLANILHA = 366;

const FONTE = "Arial";
const REAIS = '#,##0.00;[Red]-#,##0.00;"-"';
const DATA = "dd/mm/yyyy";
const AZUL = "FF0000FF";
const CINZA = "FF5A6782";
const FUNDO_DO_CABECALHO = "FFE6EDFB";
const FUNDO_DO_GRUPO = "FFF1F5FE";

const ABA = { painel: "Painel", leia: "Leia-me", semanas: "13 semanas", meses: "12 meses", dias: "Dia a dia", base: "Lançamentos", atrasados: "Atrasados", saldos: "Saldos", dePara: "De-para" };
const ref = (aba: string) => `'${aba}'`;

function dataExcel(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

const reais = (centavos: number) => Math.round(centavos) / 100;

function letra(n: number): string {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
}

function estilo(c: ExcelJS.Cell, extra: Partial<ExcelJS.Style> = {}) {
  c.font = { name: FONTE, size: 10, ...(extra.font ?? {}) };
  if (extra.numFmt) c.numFmt = extra.numFmt;
  if (extra.fill) c.fill = extra.fill;
  if (extra.alignment) c.alignment = extra.alignment;
}

const preenchido = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// ─── Base ───────────────────────────────────────────────────────────────────

/** A base de lançamentos: uma linha por conta, com a linha do fluxo puxada do De-para. */
function abaDaBase(livro: ExcelJS.Workbook, e: EntradaDaPlanilha) {
  const ws = livro.addWorksheet(ABA.base, { views: [{ state: "frozen", ySplit: 1 }] });
  const cab = ["Incluir? (1/0)", "Data de caixa", "Vencimento", "Tipo", "Cliente ou fornecedor", "Documento", "Categoria no Omie", "Categoria do cliente", "Linha do fluxo", "Valor (R$)"];
  const larguras = [13, 13, 13, 11, 34, 22, 30, 30, 34, 15];
  cab.forEach((t, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = t;
    estilo(c, { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
    ws.getColumn(i + 1).width = larguras[i];
  });
  e.contas.forEach((k, i) => {
    const r = i + 2;
    const linha = rotuloDaLinha(e.linhaDaCategoria.get(k.categoria) ?? "outras_saidas");
    const valores: ExcelJS.CellValue[] = [
      1,
      dataExcel(k.dataDeCaixa),
      dataExcel(k.vencimento),
      k.tipo,
      k.contraparte,
      k.documento,
      k.categoriaDoOmie,
      k.categoria,
      { formula: `IFERROR(INDEX(${ref(ABA.dePara)}!$B:$B,MATCH(H${r},${ref(ABA.dePara)}!$A:$A,0)),"${rotuloDaLinha(k.centavos >= 0 ? "outras_entradas" : "outras_saidas")}")`, result: linha },
      reais(k.centavos),
    ];
    valores.forEach((v, j) => {
      const c = ws.getCell(r, j + 1);
      c.value = v;
      estilo(c, {
        numFmt: j === 1 || j === 2 ? DATA : j === 9 ? REAIS : undefined,
        // A coluna de entrada do cliente, em azul.
        font: j === 0 || j === 9 ? { color: { argb: AZUL } } : {},
      });
    });
  });
  ws.autoFilter = { from: "A1", to: "J1" };
}

/** Categoria do cliente → linha do fluxo. Trocar aqui regrupa as visões. */
function abaDoDePara(livro: ExcelJS.Workbook, e: EntradaDaPlanilha) {
  const ws = livro.addWorksheet(ABA.dePara, { views: [{ state: "frozen", ySplit: 1 }] });
  ["Categoria do cliente", "Linha do fluxo", "Categorias do Omie ligadas"].forEach((t, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = t;
    estilo(c, { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  });
  ws.getColumn(1).width = 34;
  ws.getColumn(2).width = 44;
  ws.getColumn(3).width = 60;
  [...e.linhaDaCategoria.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .forEach(([categoria, linha], i) => {
      const r = i + 2;
      estilo(Object.assign(ws.getCell(r, 1), { value: categoria }));
      estilo(Object.assign(ws.getCell(r, 2), { value: rotuloDaLinha(linha) }), { font: { color: { argb: AZUL } } });
      estilo(Object.assign(ws.getCell(r, 3), { value: (e.omieDaCategoria.get(categoria) ?? []).join("; ") }), { font: { color: { argb: CINZA } } });
    });
  // As linhas possíveis, para quem trocar uma linha escrever certo.
  const inicio = e.linhaDaCategoria.size + 4;
  estilo(Object.assign(ws.getCell(inicio, 1), { value: "Linhas do fluxo (para usar na coluna B)" }), { font: { bold: true } });
  LINHAS_DO_FLUXO.forEach((l, i) => estilo(Object.assign(ws.getCell(inicio + 1 + i, 1), { value: l.label }), { font: { color: { argb: CINZA } } }));
}

// ─── As visões ──────────────────────────────────────────────────────────────

type Visao = { aba: string; periodos: Periodo[]; comCategorias: boolean };

/** Onde está o saldo final de cada visão, para o Painel. */
type Posicao = { linhaDoSaldoFinal: number; primeiraColuna: number; ultimaColuna: number };

function somaDe(e: EntradaDaPlanilha, filtro: { linha: string; categoria?: string }, p: Periodo): number {
  let s = 0;
  for (const k of e.contas) {
    if (k.dataDeCaixa < p.inicioKey || k.dataDeCaixa > p.fimKey) continue;
    if ((e.linhaDaCategoria.get(k.categoria) ?? "outras_saidas") !== filtro.linha) continue;
    if (filtro.categoria !== undefined && k.categoria !== filtro.categoria) continue;
    s += k.centavos;
  }
  return s;
}

function abaDaVisao(livro: ExcelJS.Workbook, e: EntradaDaPlanilha, v: Visao, saldoInicialCentavos: number): Posicao {
  const ws = livro.addWorksheet(v.aba, { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }], properties: { outlineProperties: { summaryBelow: false } } as ExcelJS.WorksheetProperties });
  const C0 = 3;
  const n = v.periodos.length;
  const col = (i: number) => letra(C0 + i);
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = v.comCategorias ? 30 : 4;
  for (let i = 0; i < n; i++) ws.getColumn(C0 + i).width = v.aba === ABA.dias ? 12 : 15;

  estilo(Object.assign(ws.getCell("A1"), { value: `Fluxo de caixa previsto · ${e.empresa} · ${v.aba}` }), { font: { bold: true, size: 12 } });
  estilo(Object.assign(ws.getCell("A2"), { value: "De" }), { font: { color: { argb: CINZA } } });
  estilo(Object.assign(ws.getCell("A3"), { value: "Até" }), { font: { color: { argb: CINZA } } });
  estilo(Object.assign(ws.getCell("A4"), { value: "Linha do fluxo" }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  estilo(Object.assign(ws.getCell("B4"), { value: v.comCategorias ? "Categoria" : "" }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  v.periodos.forEach((p, i) => {
    estilo(Object.assign(ws.getCell(2, C0 + i), { value: dataExcel(p.inicioKey) }), { numFmt: DATA, font: { color: { argb: CINZA } } });
    estilo(Object.assign(ws.getCell(3, C0 + i), { value: dataExcel(p.fimKey) }), { numFmt: DATA, font: { color: { argb: CINZA } } });
    estilo(Object.assign(ws.getCell(4, C0 + i), { value: p.rotulo }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO), alignment: { horizontal: "right" } });
  });

  const base = ref(ABA.base);
  const sumifs = (r: number, c: string, comCategoria: boolean) =>
    `SUMIFS(${base}!$J:$J,${base}!$I:$I,$A${r},${base}!$B:$B,">="&${c}$2,${base}!$B:$B,"<="&${c}$3,${base}!$A:$A,1${comCategoria ? `,${base}!$H:$H,$B${r}` : ""})`;

  let r = 5;
  const linhaDoSaldoInicial = r++;
  const saldoInicialRow = ws.getRow(linhaDoSaldoInicial);
  estilo(Object.assign(saldoInicialRow.getCell(1), { value: "Saldo inicial" }), { font: { bold: true } });

  const linhasDosGrupos: number[] = [];
  const valoresDosGrupos: number[][] = [];
  for (const g of GRUPOS_DO_FLUXO.filter((x) => x.code !== "fora")) {
    const rg = r++;
    linhasDosGrupos.push(rg);
    const linhasDoGrupo: number[] = [];
    const somaDoGrupo = new Array<number>(n).fill(0);
    estilo(Object.assign(ws.getCell(rg, 1), { value: `Fluxo ${g.label.toLowerCase()}` }), { font: { bold: true }, fill: preenchido(FUNDO_DO_GRUPO) });
    estilo(ws.getCell(rg, 2), { fill: preenchido(FUNDO_DO_GRUPO) });
    for (const l of LINHAS_DO_FLUXO.filter((x) => x.grupo === g.code)) {
      const rl = r++;
      linhasDoGrupo.push(rl);
      estilo(Object.assign(ws.getCell(rl, 1), { value: l.label }));
      const valores = v.periodos.map((p) => somaDe(e, { linha: l.code }, p));
      valores.forEach((x, i) => {
        somaDoGrupo[i]! += x;
        estilo(Object.assign(ws.getCell(rl, C0 + i), { value: { formula: sumifs(rl, col(i), false), result: reais(x) } }), { numFmt: REAIS });
      });
      if (!v.comCategorias) continue;
      const categorias = [...e.linhaDaCategoria.entries()].filter(([, linha]) => linha === l.code).map(([c]) => c).sort((a, b) => a.localeCompare(b, "pt-BR"));
      for (const categoria of categorias) {
        const rc = r++;
        const row = ws.getRow(rc);
        // Recolhidas debaixo da linha: o "+" do Excel abre.
        row.outlineLevel = 1;
        row.hidden = true;
        estilo(Object.assign(row.getCell(1), { value: l.label }), { font: { color: { argb: CINZA } } });
        estilo(Object.assign(row.getCell(2), { value: categoria }));
        v.periodos.forEach((p, i) => {
          estilo(Object.assign(row.getCell(C0 + i), { value: { formula: sumifs(rc, col(i), true), result: reais(somaDe(e, { linha: l.code, categoria }, p)) } }), {
            numFmt: REAIS,
            font: { color: { argb: CINZA } },
          });
        });
      }
    }
    valoresDosGrupos.push(somaDoGrupo);
    somaDoGrupo.forEach((x, i) =>
      estilo(Object.assign(ws.getCell(rg, C0 + i), { value: { formula: linhasDoGrupo.map((x2) => `${col(i)}${x2}`).join("+"), result: reais(x) } }), {
        numFmt: REAIS,
        font: { bold: true },
        fill: preenchido(FUNDO_DO_GRUPO),
      })
    );
  }

  const linhaDaVariacao = r++;
  const linhaDoSaldoFinal = r++;
  estilo(Object.assign(ws.getCell(linhaDaVariacao, 1), { value: "Variação do período" }), { font: { bold: true } });
  estilo(Object.assign(ws.getCell(linhaDoSaldoFinal, 1), { value: "Saldo final" }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  estilo(ws.getCell(linhaDoSaldoFinal, 2), { fill: preenchido(FUNDO_DO_CABECALHO) });

  let saldo = saldoInicialCentavos;
  for (let i = 0; i < n; i++) {
    const c = col(i);
    const variacao = valoresDosGrupos.reduce((s, g) => s + g[i]!, 0);
    const inicial = saldo;
    saldo += variacao;
    estilo(
      Object.assign(ws.getCell(linhaDoSaldoInicial, C0 + i), {
        value: { formula: i === 0 ? `${ref(ABA.painel)}!$B$4` : `${col(i - 1)}${linhaDoSaldoFinal}`, result: reais(inicial) },
      }),
      { numFmt: REAIS, font: { bold: true } }
    );
    estilo(Object.assign(ws.getCell(linhaDaVariacao, C0 + i), { value: { formula: linhasDosGrupos.map((g) => `${c}${g}`).join("+"), result: reais(variacao) } }), {
      numFmt: REAIS,
      font: { bold: true },
    });
    estilo(Object.assign(ws.getCell(linhaDoSaldoFinal, C0 + i), { value: { formula: `${c}${linhaDoSaldoInicial}+${c}${linhaDaVariacao}`, result: reais(saldo) } }), {
      numFmt: REAIS,
      font: { bold: true },
      fill: preenchido(FUNDO_DO_CABECALHO),
    });
  }
  return { linhaDoSaldoFinal, primeiraColuna: C0, ultimaColuna: C0 + n - 1 };
}

// ─── Painel, saldos, atrasados, leia-me ─────────────────────────────────────

function abaDosSaldos(livro: ExcelJS.Workbook, e: EntradaDaPlanilha): string {
  const ws = livro.addWorksheet(ABA.saldos);
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 18;
  estilo(Object.assign(ws.getCell("A1"), { value: "Conta" }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  estilo(Object.assign(ws.getCell("B1"), { value: "Saldo (R$)" }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) });
  const saldos = e.saldos.length ? e.saldos : [{ conta: "Saldo das contas (digite)", centavos: 0 }];
  saldos.forEach((s, i) => {
    estilo(Object.assign(ws.getCell(i + 2, 1), { value: s.conta }));
    // Entrada do cliente: em azul, como na planilha dele.
    estilo(Object.assign(ws.getCell(i + 2, 2), { value: reais(s.centavos) }), { numFmt: REAIS, font: { color: { argb: AZUL } } });
  });
  const total = saldos.length + 2;
  estilo(Object.assign(ws.getCell(total, 1), { value: "Total" }), { font: { bold: true } });
  estilo(Object.assign(ws.getCell(total, 2), { value: { formula: `SUM(B2:B${total - 1})`, result: reais(saldos.reduce((s, x) => s + x.centavos, 0)) } }), {
    numFmt: REAIS,
    font: { bold: true },
  });
  estilo(Object.assign(ws.getCell(total + 2, 1), { value: e.origemDoSaldo ? `Saldo ${e.origemDoSaldo}, em ${e.geradoEm}.` : "Sem saldo das contas no Connect: digite o saldo de hoje." }), {
    font: { color: { argb: CINZA } },
  });
  return `${ref(ABA.saldos)}!$B$${total}`;
}

function abaDosAtrasados(livro: ExcelJS.Workbook, e: EntradaDaPlanilha) {
  const ws = livro.addWorksheet(ABA.atrasados, { views: [{ state: "frozen", ySplit: 1 }] });
  const cab = ["Vencimento", "Tipo", "Cliente ou fornecedor", "Documento", "Categoria", "Valor (R$)"];
  [13, 11, 34, 22, 30, 15].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  cab.forEach((t, i) => estilo(Object.assign(ws.getCell(1, i + 1), { value: t }), { font: { bold: true }, fill: preenchido(FUNDO_DO_CABECALHO) }));
  e.atrasadas.forEach((a, i) => {
    const vals: ExcelJS.CellValue[] = [dataExcel(a.vencimento), a.tipo, a.contraparte, a.documento, a.categoria, reais(a.centavos)];
    vals.forEach((v, j) => estilo(Object.assign(ws.getCell(i + 2, j + 1), { value: v }), { numFmt: j === 0 ? DATA : j === 5 ? REAIS : undefined }));
  });
  if (e.atrasadas.length) ws.autoFilter = { from: "A1", to: "F1" };
}

function abaDoPainel(ws: ExcelJS.Worksheet, e: EntradaDaPlanilha, celulaDoSaldo: string, dias: Posicao, meses: Posicao, saldoCentavos: number, serie: { key: string; saldo: number }[], saldoEm12: number) {
  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 20;
  estilo(Object.assign(ws.getCell("A1"), { value: `Fluxo de caixa previsto · ${e.empresa}` }), { font: { bold: true, size: 14 } });
  estilo(Object.assign(ws.getCell("A2"), { value: `Gerado pelo Connect em ${e.geradoEm}. Os períodos partem de ${e.hojeKey.split("-").reverse().join("/")}.` }), {
    font: { color: { argb: CINZA } },
  });
  const faixa = (p: Posicao) => `${ref(ABA.dias)}!${letra(p.primeiraColuna)}${p.linhaDoSaldoFinal}:${letra(p.ultimaColuna)}${p.linhaDoSaldoFinal}`;
  const datas = `${ref(ABA.dias)}!${letra(dias.primeiraColuna)}$2:${letra(dias.ultimaColuna)}$2`;
  const menor = serie.reduce((m, s) => (s.saldo < m.saldo ? s : m), serie[0] ?? { key: e.hojeKey, saldo: saldoCentavos });
  const atrasadoReceber = e.atrasadas.filter((a) => a.tipo === "A receber").reduce((s, a) => s + a.centavos, 0);
  const atrasadoPagar = e.atrasadas.filter((a) => a.tipo === "A pagar").reduce((s, a) => s + a.centavos, 0);
  const linhas: [string, ExcelJS.CellValue, string?][] = [
    ["Saldo inicial (aba Saldos)", { formula: celulaDoSaldo, result: reais(saldoCentavos) }, REAIS],
    [`Menor saldo previsto (${DIAS_NA_PLANILHA} dias)`, { formula: `MIN(${faixa(dias)})`, result: reais(menor.saldo) }, REAIS],
    ["Dia do menor saldo", { formula: `INDEX(${datas},1,MATCH(B5,${faixa(dias)},0))`, result: dataExcel(menor.key) }, DATA],
    ["Dias com saldo negativo", { formula: `COUNTIF(${faixa(dias)},"<0")`, result: serie.filter((s) => s.saldo < 0).length }, "0"],
    ["Saldo no fim dos 12 meses", { formula: `${ref(ABA.meses)}!${letra(meses.ultimaColuna)}${meses.linhaDoSaldoFinal}`, result: reais(saldoEm12) }, REAIS],
    ["Atrasado a receber (fora das visões)", { formula: `SUMIFS(${ref(ABA.atrasados)}!$F:$F,${ref(ABA.atrasados)}!$B:$B,"A receber")`, result: reais(atrasadoReceber) }, REAIS],
    ["Atrasado a pagar (fora das visões)", { formula: `SUMIFS(${ref(ABA.atrasados)}!$F:$F,${ref(ABA.atrasados)}!$B:$B,"A pagar")`, result: reais(atrasadoPagar) }, REAIS],
  ];
  linhas.forEach(([rotulo, valor, fmt], i) => {
    estilo(Object.assign(ws.getCell(4 + i, 1), { value: rotulo }));
    estilo(Object.assign(ws.getCell(4 + i, 2), { value: valor }), { numFmt: fmt, font: { bold: true } });
  });
  const regras = `A receber entra ${e.regras.diasReceber} dia(s) depois da previsão; a pagar sai ${e.regras.diasPagar} dia(s) depois; os dois em dia útil.`;
  estilo(Object.assign(ws.getCell("A12"), { value: regras }), { font: { color: { argb: CINZA } } });
}

function abaDoLeiaMe(ws: ExcelJS.Worksheet) {
  ws.getColumn(1).width = 110;
  const texto = [
    "Como usar este arquivo",
    "",
    "• As abas 13 semanas, 12 meses e Dia a dia são fórmulas sobre a aba Lançamentos: mude um valor, uma data ou o “Incluir?” de uma linha e elas recalculam.",
    "• “Incluir?” = 0 tira o lançamento das visões sem apagar. Para simular uma conta nova, acrescente uma linha no fim de Lançamentos.",
    "• A linha do fluxo de cada lançamento vem da aba De-para. Trocar a linha de uma categoria lá regrupa as visões.",
    "• O saldo inicial é a soma da aba Saldos. As células em azul são as de entrada.",
    "• Nas visões, as categorias ficam recolhidas debaixo de cada linha: o “+” à esquerda abre.",
    "• O que já venceu e não foi pago fica na aba Atrasados, fora das visões.",
    "• O arquivo é uma foto do dia em que foi gerado. Para os números novos, baixe de novo no Connect.",
  ];
  texto.forEach((t, i) => estilo(Object.assign(ws.getCell(i + 1, 1), { value: t }), { font: i === 0 ? { bold: true, size: 12 } : {}, alignment: { wrapText: true } }));
}

// ─── O arquivo ──────────────────────────────────────────────────────────────

export async function gerarPlanilhaDoPrevisto(e: EntradaDaPlanilha): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = "Connect";
  livro.calcProperties = { fullCalcOnLoad: true };

  // O Painel primeiro (é a primeira aba que abre), preenchido no fim: ele lê as outras.
  const painel = livro.addWorksheet(ABA.painel);
  const leia = livro.addWorksheet(ABA.leia);
  const saldoCentavos = e.saldos.reduce((s, x) => s + x.centavos, 0);

  const dias: Periodo[] = Array.from({ length: DIAS_NA_PLANILHA }, (_, i) => {
    const k = somarDias(e.hojeKey, i);
    return { chave: k, rotulo: `${k.slice(8, 10)}/${k.slice(5, 7)}`, inicioKey: k, fimKey: k };
  });
  const semanas = periodosDoPrevisto(e.hojeKey, "semanas");
  const meses = periodosDoPrevisto(e.hojeKey, "meses");

  abaDaVisao(livro, e, { aba: ABA.semanas, periodos: semanas, comCategorias: true }, saldoCentavos);
  const posMeses = abaDaVisao(livro, e, { aba: ABA.meses, periodos: meses, comCategorias: true }, saldoCentavos);
  const posDias = abaDaVisao(livro, e, { aba: ABA.dias, periodos: dias, comCategorias: false }, saldoCentavos);
  abaDaBase(livro, e);
  abaDosAtrasados(livro, e);
  const celulaDoSaldo = abaDosSaldos(livro, e);
  abaDoDePara(livro, e);

  // A série diária e o saldo em 12 meses, com a mesma regra das fórmulas, para os valores gravados.
  const porDia = new Map<string, number>();
  for (const k of e.contas) {
    if ((e.linhaDaCategoria.get(k.categoria) ?? "outras_saidas") === "fora") continue;
    porDia.set(k.dataDeCaixa, (porDia.get(k.dataDeCaixa) ?? 0) + k.centavos);
  }
  let corrente = saldoCentavos;
  const serie = dias.map((d) => ({ key: d.chave, saldo: (corrente += porDia.get(d.chave) ?? 0) }));
  const fim12 = meses.at(-1)!.fimKey;
  const saldoEm12 = saldoCentavos + e.contas.filter((k) => k.dataDeCaixa <= fim12 && (e.linhaDaCategoria.get(k.categoria) ?? "outras_saidas") !== "fora").reduce((s, k) => s + k.centavos, 0);

  abaDoPainel(painel, e, celulaDoSaldo, posDias, posMeses, saldoCentavos, serie, saldoEm12);
  abaDoLeiaMe(leia);

  return Buffer.from(await livro.xlsx.writeBuffer());
}

export function nomeDoArquivoDoPrevisto(empresa: string, hojeKey: string): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Fluxo de caixa previsto - ${limpo} - ${hojeKey.split("-").reverse().join("-")}.xlsx`;
}
