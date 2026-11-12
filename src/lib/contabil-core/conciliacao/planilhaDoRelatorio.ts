// O relatório da conciliação em planilha: resumo, avisos e pendências (Bloco B, Fase B2,
// 12/11/2026). Porte de `gerar_planilha` (`src/domain/conciliacao_bancaria/exportar.py`), com o
// exceljs no lugar do openpyxl.
//
// Fidelidade (conferida pelo gabarito `gabarito/planilha-conciliacao-*.json`, a planilha do original
// lida de volta): as mesmas folhas, na mesma ordem, com os mesmos valores, tipos, formatos de número,
// negrito, preenchimento, larguras, painel congelado e filtro. Detalhes do openpyxl que contam:
// - `ws.append` cria a célula mesmo vazia, e o negrito do cabeçalho vai até a última coluna da folha
//   (`ws[ws.max_row]`), por isso a célula vazia ao lado de "Avisos" também sai em negrito;
// - texto vazio ("") não é gravado: no Excel a célula fica vazia;
// - dinheiro sai como número (`float(Decimal)`), e todo texto passa pela `celulaSegura` (fórmula
//   vinda de um histórico não pode ser executada por quem abre o arquivo).

import ExcelJS from "exceljs";
import { texto, type Dec } from "../motor/decimal";
import { celulaSegura } from "../motor/dominio";
import { milhar } from "./razao";
import type { RazaoConta } from "./razaoTipos";
import { ROTULOS_DO_GRUPO, type RelatorioConciliacao } from "./relatorio";
import { dataBr } from "./servico";

type Valor = string | number | Date | null;

const NEGRITO: Partial<ExcelJS.Font> = { bold: true };
const CABECALHO: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "00DDEBF7" } };
const MILHAR = "#,##0.00";
const DATA = "DD/MM/YYYY";

/** `float(Decimal)`: o double mais próximo, o mesmo que `Number` dá do texto exato. */
const numero = (d: Dec): number => Number(texto(d));
/** `date` do Python na célula: meia-noite UTC, que o exceljs grava como número de série. */
const data = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Uma folha escrita como o `ws.append` do openpyxl: linha a linha, contando as vazias. */
class Folha {
  linha = 0;
  constructor(readonly ws: ExcelJS.Worksheet) {}

  /** `_linha`: acrescenta a linha (texto pela `celulaSegura`); `negrito` vale até `ate` colunas. */
  acrescentar(valores: readonly Valor[], negrito = false, ate = valores.length): ExcelJS.Row {
    this.linha += 1;
    const row = this.ws.getRow(this.linha);
    valores.forEach((v, i) => {
      const seguro = typeof v === "string" ? celulaSegura(v) : v;
      if (seguro !== null && seguro !== "") row.getCell(i + 1).value = seguro;
    });
    if (negrito) for (let c = 1; c <= ate; c++) row.getCell(c).font = NEGRITO;
    return row;
  }

  /** `ws.append([])` */
  pularLinha(): void {
    this.linha += 1;
  }

  formato(row: ExcelJS.Row, colunas: readonly number[], fmt: string): void {
    for (const c of colunas) row.getCell(c).numFmt = fmt;
  }

  cabecalho(row: ExcelJS.Row, colunas: number): void {
    for (let c = 1; c <= colunas; c++) row.getCell(c).fill = CABECALHO;
  }

  larguras(ws: readonly number[]): void {
    ws.forEach((w, i) => (this.ws.getColumn(i + 1).width = w));
  }

  congelarCabecalho(): void {
    this.ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2" }];
  }
}

/** `gerar_planilha`: o .xlsx do relatório. */
export async function planilhaDaConciliacao(relatorio: RelatorioConciliacao): Promise<Uint8Array> {
  const r = relatorio.resumo;
  const wb = new ExcelJS.Workbook();

  const resumo = new Folha(wb.addWorksheet("Resumo"));
  const periodo = `${dataBr(r.periodoInicio ?? "")} a ${dataBr(r.periodoFim ?? "")}`;
  const linhas: [string, Valor | Dec][] = [
    ["Empresa", r.empresa],
    ["Conta do razão", r.contaRazao],
    ["Conta bancária", r.contaBancaria],
    ["Período", periodo],
    ["Lançamentos no razão", r.lancamentosRazao],
    ["Lançamentos no extrato", r.lancamentosExtrato],
    ["Conciliados", r.conciliados],
    ["Pendências", r.pendencias],
    ["Aplicação automática não conferida (extrato não traz)", r.aplicacaoSemExtrato],
    ["Movimento do razão (sem abertura)", r.movimentoRazao],
    ["Movimento do extrato", r.movimentoExtrato],
    ["Diferença", r.diferenca],
    ["As pendências explicam a diferença?", r.diferencaExplicada ? "Sim" : "NÃO — revisar"],
  ];
  for (const [rotulo, valor] of linhas) {
    // No original, os valores em `float` (o dinheiro) levam o formato de milhar.
    const dinheiro = valor !== null && typeof valor === "object" && !(valor instanceof Date);
    const row = resumo.acrescentar([rotulo, dinheiro ? numero(valor) : (valor as Valor)]);
    row.getCell(1).font = NEGRITO;
    if (dinheiro) row.getCell(2).numFmt = MILHAR;
  }
  for (const a of r.abertura) {
    resumo.acrescentar(["Abertura (não conciliável)", `${dataBr(a.data)} ${a.historico} ${milhar(a.valor)}`]);
  }
  if (relatorio.avisos.length) {
    resumo.pularLinha();
    // A folha do resumo tem duas colunas: o negrito de "Avisos" vai até a B.
    resumo.acrescentar(["Avisos"], true, 2);
    for (const aviso of relatorio.avisos) resumo.acrescentar([aviso]);
  }
  resumo.larguras([38, 90]);

  const pend = new Folha(wb.addWorksheet("Pendências"));
  const colunas = ["Tipo", "Data razão", "Valor razão", "Histórico razão", "Lote", "Contrapartida",
    "Data extrato", "Valor extrato", "Histórico extrato", "Diferença"];
  pend.cabecalho(pend.acrescentar(colunas, true), colunas.length);
  for (const g of relatorio.pendencias) {
    const altura = Math.max(g.razao.length, g.extrato.length, 1);
    for (let i = 0; i < altura; i++) {
      const rz = i < g.razao.length ? g.razao[i] : null;
      const ex = i < g.extrato.length ? g.extrato[i] : null;
      const row = pend.acrescentar([
        i === 0 ? (ROTULOS_DO_GRUPO[g.tipo] ?? g.tipo) : "",
        rz ? data(rz.data) : null, rz ? numero(rz.valor) : null,
        rz ? rz.historico : null, rz ? rz.lote : null, rz ? rz.contrapartida : null,
        ex ? data(ex.data) : null, ex ? numero(ex.valor) : null,
        ex ? ex.historico : null,
        i === 0 ? numero(g.diferenca) : null,
      ]);
      pend.formato(row, [2, 7], DATA);
      pend.formato(row, [3, 8, 10], MILHAR);
    }
    for (const pg of g.sispagFaltando) {
      // Pago pelo banco dentro do lote, sem lançamento no razão.
      const row = pend.acrescentar([
        "  pagamento do SISPAG sem par no razão", null, null,
        `${pg.favorecido} (${pg.documento}) — ${pg.tipo}`, null, null,
        data(pg.data), numero(pg.valor), null, null,
      ]);
      pend.formato(row, [7], DATA);
      pend.formato(row, [8], MILHAR);
    }
  }
  pend.larguras([30, 12, 15, 55, 12, 14, 12, 15, 45, 14]);
  pend.congelarCabecalho();
  pend.ws.autoFilter = `A1:J${pend.linha}`;

  if (relatorio.porDia.length) {
    const dia = new Folha(wb.addWorksheet("Por dia"));
    const cab = ["Data", "Lanç. razão", "Lanç. extrato", "Movimento razão", "Movimento extrato",
      "Diferença", "Pendências", "Casados em outro dia", "Aplicação não conferida"];
    dia.cabecalho(dia.acrescentar(cab, true), cab.length);
    for (const d of relatorio.porDia) {
      const row = dia.acrescentar([data(d.data), d.lancamentosRazao, d.lancamentosExtrato,
        numero(d.movimentoRazao), numero(d.movimentoExtrato), numero(d.diferenca),
        d.pendencias, d.dataDiferente, d.aplicacaoSemExtrato]);
      dia.formato(row, [1], DATA);
      dia.formato(row, [4, 5, 6], MILHAR);
    }
    dia.larguras([12, 12, 13, 17, 17, 15, 12, 18, 22]);
    dia.congelarCabecalho();
    dia.ws.autoFilter = `A1:I${dia.linha}`;
  }

  if (relatorio.aplicacaoSemExtrato.length) {
    const ap = new Folha(wb.addWorksheet("Aplicação não conferida"));
    const cab = ["Data", "Valor", "Histórico", "Lote", "Contrapartida"];
    ap.cabecalho(ap.acrescentar(cab, true), cab.length);
    for (const l of relatorio.aplicacaoSemExtrato) {
      const row = ap.acrescentar([data(l.data), numero(l.valor), l.historico, l.lote, l.contrapartida]);
      ap.formato(row, [1], DATA);
      ap.formato(row, [2], MILHAR);
    }
    ap.larguras([12, 15, 55, 12, 14]);
    ap.congelarCabecalho();
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** O nome do arquivo baixado (a rota do original): `conciliacao_{conta}_{AAAA-MM}.xlsx`. */
export function nomeDaPlanilha(razao: RazaoConta): string {
  return `conciliacao_${razao.contaCodigo || "conta"}_${(razao.periodoInicio ?? "").slice(0, 7)}.xlsx`;
}
