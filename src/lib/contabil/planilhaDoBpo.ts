// O relatório de pagamentos do BPO como fonte das faturas de aluguel
// (03/11/2026), portado de `importacao_apoio.ler` (SPED Generator). Cada linha
// da aba "Pagamentos realizados…" vira um pagamento `tipo = "fatura"`.
//
// - A identidade é a posição na planilha: a mesma nota é paga em parcelas, e a
//   frota tem dezenas de linhas idênticas (um carro cada). Por isso reimportar
//   a mesma planilha substitui as linhas dela.
// - O relatório não traz CNPJ, só o nome do fornecedor: o documento fica vazio
//   e o crédito sai pelo nome (ver `pagamentos.ts`).
// - O comprovante liga pelo número da nota no NOME do PDF enviado junto, como
//   no motor; o conteúdo do PDF não é lido.

import ExcelJS from "exceljs";

export const ABA_DO_BPO = "Pagamentos realizados";

export class PlanilhaInvalida extends Error {}

export type LinhaDaPlanilha = {
  /** A posição da linha entre as de fornecedor, a partir de 1. */
  posicao: number;
  nome: string;
  numero: string;
  dataPagamento: string;
  competencia: string;
  centavos: number | null;
  centroCusto: string;
  categoria: string;
  situacao: "ok" | "conferir";
  observacao: string;
  /** O nome do PDF enviado que comprova a linha, quando o número da nota casa. */
  comprovante: string;
  chaveNegocio: string;
};

const semAcento = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\x00-\x7f]/g, "");
const espacos = (t: string) => t.split(/\s+/).filter(Boolean).join(" ");

/** Os números de nota do campo, que às vezes lista mais de um ("56 / 57"). */
export function numerosDaNota(texto: string): string[] {
  return (texto ?? "").split(/[\s/,;]+/).map((p) => p.replace(/\D/g, "")).filter((d) => d.length >= 3);
}

/** {número da nota: nome do PDF}, do nome de cada arquivo ("MOVIDA - FATURA 06330021.pdf", "C20391_F514527.pdf"). O primeiro vence. */
export function indexarNomes(nomes: readonly string[]): Map<string, string> {
  const indice = new Map<string, string>();
  for (const nome of nomes) {
    const stem = nome.replace(/\.[^.]*$/, "");
    for (const bruto of stem.match(/[A-Za-z]*[-_ ]?\d{3,12}/g) ?? []) {
      const digitos = bruto.replace(/\D/g, "");
      if (digitos.length >= 4 && !indice.has(digitos)) indice.set(digitos, nome);
    }
  }
  return indice;
}

/** A chave de negócio do motor: documento (ou nome), data e valor — agrupa duplicatas para uma pessoa decidir, não recusa. */
export function chaveDeNegocio(tipo: string, documento: string, nome: string, dataPagamento: string, centavos: number | null, discriminador = ""): string {
  const quem = (documento ?? "").replace(/\D/g, "") || espacos((nome ?? "").toUpperCase());
  if (!quem) return "";
  const valor = centavos === null ? "" : (centavos / 100).toFixed(2);
  const sufixo = discriminador.trim() ? `|${discriminador}` : "";
  return `${tipo}|${quem}|${dataPagamento ?? ""}|${valor}${sufixo}`.slice(0, 120);
}

function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return texto(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

function centavosDaCelula(v: ExcelJS.CellValue): number | null {
  if (v && typeof v === "object" && "result" in v) return centavosDaCelula(v.result as ExcelJS.CellValue);
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  const t = texto(v).trim();
  if (!t) return null;
  // O `to_numeric` do pandas: número com ponto decimal; o resto é "sem valor".
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function dataDaCelula(v: ExcelJS.CellValue): string {
  if (v && typeof v === "object" && "result" in v) return dataDaCelula(v.result as ExcelJS.CellValue);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const t = texto(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  return br ? `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}` : "";
}

/** As faturas do relatório. `pdfs` são os nomes dos PDFs enviados junto, para ligar o comprovante. */
export async function lerPlanilhaDoBpo(bytes: Uint8Array, pdfs: readonly string[] = []): Promise<LinhaDaPlanilha[]> {
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new PlanilhaInvalida("O arquivo não é uma planilha .xlsx.");
  }
  const aba = livro.worksheets.find((w) => semAcento(w.name).toUpperCase().startsWith(semAcento(ABA_DO_BPO).toUpperCase()));
  if (!aba) throw new PlanilhaInvalida(`Não achei a aba "${ABA_DO_BPO}…". Abas: ${livro.worksheets.map((w) => w.name).join(", ")}.`);
  // O cabeçalho é a segunda linha, como no relatório do BPO.
  const cabecalho = aba.getRow(2);
  const colunas = new Map<string, number>();
  cabecalho.eachCell((cell, col) => colunas.set(texto(cell.value).trim(), col));
  const coluna = (prefixo: string) => {
    for (const [nome, col] of colunas) if (semAcento(nome).trim().toUpperCase().startsWith(prefixo.toUpperCase())) return col;
    throw new PlanilhaInvalida(`Não achei a coluna que começa com "${prefixo}". Colunas: ${[...colunas.keys()].join(", ")}.`);
  };
  const [cFornecedor, cNota, cValor, cData, cSituacao, cCategoria] = ["Fornecedor", "Nota Fiscal", "Pago ou Recebido", "Data de Pagto", "Situa", "Categoria"].map(coluna);
  const indice = indexarNomes(pdfs);

  const linhas: LinhaDaPlanilha[] = [];
  for (let r = 3; r <= aba.rowCount; r++) {
    const row = aba.getRow(r);
    const nome = espacos(texto(row.getCell(cFornecedor).value));
    if (!nome) continue;
    const posicao = linhas.length + 1;
    const centavos = centavosDaCelula(row.getCell(cValor).value);
    const dataPagamento = dataDaCelula(row.getCell(cData).value);
    const numero = espacos(texto(row.getCell(cNota).value));
    const situacaoDoBpo = texto(row.getCell(cSituacao).value).trim();
    const avisos: string[] = [];
    if (centavos === null) avisos.push("o relatório não traz valor nesta linha");
    if (!dataPagamento) avisos.push("o relatório não traz data de pagamento");
    // "Pago" é o único estado que o relatório traz; outro é novidade e precisa de olho antes de virar despesa.
    if (situacaoDoBpo && situacaoDoBpo.toUpperCase() !== "PAGO") avisos.push(`situação no relatório do BPO: ${situacaoDoBpo}`);
    const comprovante = numerosDaNota(numero).map((n) => indice.get(n)).find(Boolean) ?? "";
    linhas.push({
      posicao, nome: nome.slice(0, 200), numero: numero.slice(0, 30), dataPagamento, competencia: dataPagamento.slice(0, 7), centavos,
      centroCusto: espacos(texto(row.getCell(cCategoria).value)).slice(0, 20),
      // Nenhum fornecedor tem categoria fixa (a VAMOS saiu em 02/09/2026): veículo é o padrão.
      categoria: "fatura_aluguel_veiculo",
      situacao: avisos.length ? "conferir" : "ok", observacao: avisos.join(" | ").slice(0, 300), comprovante,
      chaveNegocio: chaveDeNegocio("fatura", "", nome, dataPagamento, centavos, String(posicao)),
    });
  }
  return linhas;
}
