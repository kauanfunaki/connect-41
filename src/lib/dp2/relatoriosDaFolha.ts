// Relatórios da folha do DP 2 (25/11/2026, funcionalidade-748, entrega 1).
//
// Uma planilha por competência, com uma aba para cada relatório da Domínio
// (Relatórios › Folha, Encargos e Provisões), montada do que o cálculo já
// guardou em cada Dp2Calculo:
// - Resumo: os totais por rubrica e os encargos patronais;
// - Analítica: cada pessoa, rubrica a rubrica;
// - Encargos: INSS da empresa, RAT, terceiros e FGTS por pessoa;
// - Provisões: férias, 1/3, 13º e os encargos sobre eles, por pessoa.
//
// Puro, sem banco (a planilha sai em memória).

import ExcelJS from "exceljs";
import { r2 } from "@/lib/rescisao/constantes";
import type { Encargos, ItemDoHolerite, Provisoes } from "./mensal";

export type CalculoDoRelatorio = {
  nome: string;
  cpf: string | null;
  itens: readonly Pick<ItemDoHolerite, "codigo" | "nome" | "tipo" | "referencia" | "valor">[];
  proventos: number;
  descontos: number;
  liquido: number;
  baseInss: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  baseFgts: number;
  fgts: number;
  encargos: Pick<Encargos, "base" | "inssEmpresa" | "rat" | "terceiros" | "fgts" | "total"> | null;
  provisoes: Pick<Provisoes, "ferias" | "tercoFerias" | "decimo" | "encargosFerias" | "encargosDecimo" | "total"> | null;
};

export type LinhaDoResumo = { codigo: string; nome: string; tipo: string; pessoas: number; valor: number };

const ORDEM_DO_TIPO: Record<string, number> = { PROVENTO: 0, DESCONTO: 1, INFORMATIVA: 2 };

/** Os totais por rubrica: proventos, depois descontos e informativas, pelo código. */
export function resumoPorRubrica(calculos: readonly CalculoDoRelatorio[]): LinhaDoResumo[] {
  const por = new Map<string, LinhaDoResumo & { quem: Set<number> }>();
  calculos.forEach((c, i) => {
    for (const item of c.itens) {
      const chave = `${item.tipo}|${item.codigo}`;
      const linha = por.get(chave) ?? { codigo: item.codigo, nome: item.nome, tipo: item.tipo, pessoas: 0, valor: 0, quem: new Set<number>() };
      linha.valor = r2(linha.valor + item.valor);
      linha.quem.add(i);
      por.set(chave, linha);
    }
  });
  return [...por.values()]
    .map(({ quem, ...l }) => ({ ...l, pessoas: quem.size }))
    .sort((a, b) => (ORDEM_DO_TIPO[a.tipo] ?? 9) - (ORDEM_DO_TIPO[b.tipo] ?? 9) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

const soma = <T>(lista: readonly T[], f: (x: T) => number) => r2(lista.reduce((s, x) => s + f(x), 0));

export function totaisDoRelatorio(calculos: readonly CalculoDoRelatorio[]) {
  return {
    proventos: soma(calculos, (c) => c.proventos),
    descontos: soma(calculos, (c) => c.descontos),
    liquido: soma(calculos, (c) => c.liquido),
    inss: soma(calculos, (c) => c.inss),
    irrf: soma(calculos, (c) => c.irrf),
    fgts: soma(calculos, (c) => c.fgts),
    inssEmpresa: soma(calculos, (c) => c.encargos?.inssEmpresa ?? 0),
    rat: soma(calculos, (c) => c.encargos?.rat ?? 0),
    terceiros: soma(calculos, (c) => c.encargos?.terceiros ?? 0),
    encargos: soma(calculos, (c) => c.encargos?.total ?? 0),
    provisoes: soma(calculos, (c) => c.provisoes?.total ?? 0),
  };
}

const NOME_DO_TIPO: Record<string, string> = { PROVENTO: "Provento", DESCONTO: "Desconto", INFORMATIVA: "Informativa" };
const MOEDA = '#,##0.00;[Red]-#,##0.00';
const cpfFormatado = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : (c ?? ""));

function aba(wb: ExcelJS.Workbook, nome: string, titulo: string, colunas: { titulo: string; largura: number; moeda?: boolean }[]) {
  const ws = wb.addWorksheet(nome);
  ws.addRow([titulo]).font = { bold: true, size: 12 };
  ws.addRow([]);
  const cab = ws.addRow(colunas.map((c) => c.titulo));
  cab.font = { bold: true };
  cab.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEDED" } };
    cell.border = { bottom: { style: "thin" } };
  });
  colunas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.largura;
    if (c.moeda) col.numFmt = MOEDA;
  });
  ws.views = [{ state: "frozen", ySplit: 3 }];
  return ws;
}

function linhaDeTotal(ws: ExcelJS.Worksheet, valores: (string | number | null)[]) {
  const r = ws.addRow(valores);
  r.font = { bold: true };
  r.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
}

/** A planilha com as quatro abas. `titulo` = "Empresa · Folha mensal 06/2027". */
export async function planilhaDosRelatorios(titulo: string, calculos: readonly CalculoDoRelatorio[]): Promise<Buffer> {
  const pessoas = [...calculos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const t = totaisDoRelatorio(pessoas);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Connect · DP 2";

  // Resumo
  const resumo = aba(wb, "Resumo", `Resumo da folha · ${titulo}`, [
    { titulo: "Código", largura: 10 },
    { titulo: "Rubrica", largura: 40 },
    { titulo: "Tipo", largura: 14 },
    { titulo: "Pessoas", largura: 10 },
    { titulo: "Valor", largura: 16, moeda: true },
  ]);
  for (const l of resumoPorRubrica(pessoas)) resumo.addRow([l.codigo, l.nome, NOME_DO_TIPO[l.tipo] ?? l.tipo, l.pessoas, l.valor]);
  resumo.addRow([]);
  for (const [rotulo, valor] of [
    ["Total de proventos", t.proventos],
    ["Total de descontos", t.descontos],
    ["Líquido", t.liquido],
    ["INSS dos empregados", t.inss],
    ["IRRF", t.irrf],
    ["FGTS", t.fgts],
    ["INSS da empresa", t.inssEmpresa],
    ["RAT/FAP", t.rat],
    ["Terceiros", t.terceiros],
    ["Encargos patronais (INSS empresa + RAT + terceiros + FGTS)", t.encargos],
    ["Provisões do mês (férias, 13º e encargos)", t.provisoes],
  ] as const)
    linhaDeTotal(resumo, [null, rotulo, null, null, valor]);
  resumo.addRow([]);
  resumo.addRow([null, `${pessoas.length} pessoa(s) no cálculo`]);

  // Analítica
  const analitica = aba(wb, "Analítica", `Folha analítica · ${titulo}`, [
    { titulo: "Colaborador", largura: 34 },
    { titulo: "CPF", largura: 16 },
    { titulo: "Código", largura: 10 },
    { titulo: "Rubrica", largura: 36 },
    { titulo: "Referência", largura: 14 },
    { titulo: "Provento", largura: 14, moeda: true },
    { titulo: "Desconto", largura: 14, moeda: true },
  ]);
  for (const c of pessoas) {
    for (const i of c.itens) {
      analitica.addRow([c.nome, cpfFormatado(c.cpf), i.codigo, i.nome, i.referencia, i.tipo === "PROVENTO" ? i.valor : null, i.tipo === "DESCONTO" ? i.valor : null]);
    }
    linhaDeTotal(analitica, [c.nome, null, null, `Líquido ${c.liquido.toFixed(2).replace(".", ",")} · base INSS ${c.baseInss.toFixed(2).replace(".", ",")} · base IRRF ${c.baseIrrf.toFixed(2).replace(".", ",")} · FGTS ${c.fgts.toFixed(2).replace(".", ",")}`, null, c.proventos, c.descontos]);
    analitica.addRow([]);
  }
  linhaDeTotal(analitica, ["Total da folha", null, null, null, null, t.proventos, t.descontos]);

  // Encargos
  const encargos = aba(wb, "Encargos", `Relação de encargos · ${titulo}`, [
    { titulo: "Colaborador", largura: 34 },
    { titulo: "Base INSS", largura: 14, moeda: true },
    { titulo: "INSS empregado", largura: 15, moeda: true },
    { titulo: "INSS empresa", largura: 14, moeda: true },
    { titulo: "RAT/FAP", largura: 12, moeda: true },
    { titulo: "Terceiros", largura: 12, moeda: true },
    { titulo: "Base FGTS", largura: 14, moeda: true },
    { titulo: "FGTS", largura: 12, moeda: true },
    { titulo: "Total patronal", largura: 15, moeda: true },
  ]);
  for (const c of pessoas) encargos.addRow([c.nome, c.baseInss, c.inss, c.encargos?.inssEmpresa ?? 0, c.encargos?.rat ?? 0, c.encargos?.terceiros ?? 0, c.baseFgts, c.fgts, c.encargos?.total ?? 0]);
  linhaDeTotal(encargos, ["Total", soma(pessoas, (c) => c.baseInss), t.inss, t.inssEmpresa, t.rat, t.terceiros, soma(pessoas, (c) => c.baseFgts), t.fgts, t.encargos]);

  // Provisões
  const provisoes = aba(wb, "Provisões", `Provisões de férias e 13º · ${titulo}`, [
    { titulo: "Colaborador", largura: 34 },
    { titulo: "Férias", largura: 13, moeda: true },
    { titulo: "1/3 de férias", largura: 13, moeda: true },
    { titulo: "Encargos s/ férias", largura: 16, moeda: true },
    { titulo: "13º", largura: 13, moeda: true },
    { titulo: "Encargos s/ 13º", largura: 15, moeda: true },
    { titulo: "Total", largura: 14, moeda: true },
  ]);
  for (const c of pessoas) {
    const p = c.provisoes;
    provisoes.addRow([c.nome, p?.ferias ?? 0, p?.tercoFerias ?? 0, p?.encargosFerias ?? 0, p?.decimo ?? 0, p?.encargosDecimo ?? 0, p?.total ?? 0]);
  }
  linhaDeTotal(provisoes, [
    "Total",
    soma(pessoas, (c) => c.provisoes?.ferias ?? 0),
    soma(pessoas, (c) => c.provisoes?.tercoFerias ?? 0),
    soma(pessoas, (c) => c.provisoes?.encargosFerias ?? 0),
    soma(pessoas, (c) => c.provisoes?.decimo ?? 0),
    soma(pessoas, (c) => c.provisoes?.encargosDecimo ?? 0),
    t.provisoes,
  ]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
