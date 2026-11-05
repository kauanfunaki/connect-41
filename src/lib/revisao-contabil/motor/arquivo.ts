// Entrada de arquivos do motor: PDF com texto, CSV/TXT, Excel (.xlsx) e ZIP.
// Portado de `dist/engine.py` e `dist/pdfextract.py` (AudTool R_12 provisório, commit 92658a2):
// `extract_file`, `unpack` e `coordinate_pages`.
//
// O que mudou na vinda (o resto é cópia fiel):
// - PDF: o original lia com o pdfminer (caractere a caractere); aqui é o pdf.js do `unpdf`, que entrega
//   trechos com a posição. As linhas são montadas com as mesmas regras (mesma altura com folga de 0,7;
//   espaço quando a distância passa de 1,5; trecho repetido na mesma posição descartado). Conferido em
//   05/11/2026 com os 12 PDFs das três empresas da regressão: a análise saiu idêntica; mudam só o texto
//   original e o número de algumas linhas, e espaços no histórico do razão, que as regras não usam.
// - Excel 97-2003 (.xls): o original usava o xlrd; o Connect não tem leitor de .xls. Recusa com aviso.
// - Excel (.xlsx): `exceljs` no lugar do openpyxl, com a mesma conversão para texto separado por ";".

import { inflateSync } from "fflate";
import { parsePages, csvAccounts } from "./leitura";
import { escreverCsv } from "./csvPython";
import { len, strip } from "./py";
import type { ContaBalancete, Fatos } from "./tipos";

/** `Path(nome).suffix` (POSIX). */
export function sufixo(nome: string): string {
  const base = nome.slice(nome.lastIndexOf("/") + 1);
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i) : "";
}

/** `Path(nome).name` (POSIX). */
export function nomeBase(nome: string): string {
  const partes = nome.split("/").filter((p) => p && p !== ".");
  return partes.length ? partes[partes.length - 1] : "";
}

type Trecho = { str: string; x: number; y: number; width: number };

/** Linhas de uma página a partir dos trechos do pdf.js, como o `coordinate_pages` do original montava a partir dos caracteres. */
export function textoDaPagina(itens: readonly Trecho[]): string {
  const visiveis = itens.filter((p) => p.str.length);
  const grupos: { y: number; itens: Trecho[] }[] = [];
  const ordenados = [...visiveis].sort((a, b) => Math.round(b.y * 10) / 10 - Math.round(a.y * 10) / 10 || a.x - b.x);
  for (const c of ordenados) {
    let g = grupos.slice(-3).find((x) => Math.abs(x.y - c.y) < 0.7);
    if (!g) {
      g = { y: c.y, itens: [] };
      grupos.push(g);
    }
    g.itens.push(c);
  }
  return grupos
    .sort((a, b) => b.y - a.y)
    .map((g) => {
      let texto = "";
      let fim: number | null = null;
      const vistos = new Set<string>();
      for (const c of [...g.itens].sort((a, b) => a.x - b.x)) {
        const k = c.x.toFixed(2) + "|" + c.str;
        if (vistos.has(k)) continue;
        vistos.add(k);
        if (fim !== null && c.x - fim > 1.5) texto += " ";
        texto += c.str;
        fim = c.x + c.width;
      }
      return texto;
    })
    .join("\n");
}

const MAX_PAGINAS = 300;

/** Texto de cada página de um PDF; recusa PDF criptografado e acima de 300 páginas, como o original. */
export async function paginasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const { getDocumentProxy, extractTextItems } = await import("unpdf");
  let pdf;
  try {
    // O pdf.js toma posse do buffer: uma cópia, para quem chamou continuar com o dele.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if (e instanceof Error && e.name === "PasswordException") throw new Error("PDF criptografado: forneça uma cópia sem senha.");
    throw e;
  }
  try {
    const { info } = (await pdf.getMetadata()) as { info?: { EncryptFilterName?: string | null } };
    if (info?.EncryptFilterName) throw new Error("PDF criptografado: forneça uma cópia sem senha.");
    if (pdf.numPages > MAX_PAGINAS) throw new Error(`PDF ultrapassa ${MAX_PAGINAS} páginas.`);
    const { items } = await extractTextItems(pdf);
    return items.map(textoDaPagina);
  } finally {
    await pdf.loadingTask.destroy();
  }
}

// cp1252 sem os cinco bytes que o Python recusa (0x81, 0x8D, 0x8F, 0x90, 0x9D).
const CP1252_INDEFINIDOS = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

/** `raw.decode('utf-8-sig')`, ou `cp1252` quando não é UTF-8 válido. */
export function decodificarTexto(raw: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    const i = raw.findIndex((b) => CP1252_INDEFINIDOS.has(b));
    if (i >= 0)
      throw new Error(`'charmap' codec can't decode byte 0x${raw[i].toString(16).padStart(2, "0")} in position ${i}: character maps to <undefined>`);
    return new TextDecoder("windows-1252").decode(raw);
  }
}

/** `format(v, '.2f')` do Python: arredondamento meio-para-par sobre o valor binário exato. */
export function formato2f(v: number): string {
  if (!Number.isFinite(v)) return v > 0 ? "inf" : v < 0 ? "-inf" : "nan";
  const negativo = v < 0 || Object.is(v, -0);
  if (Math.abs(v) < 1e-6) return (negativo ? "-" : "") + "0.00";
  const exato = Math.abs(v).toPrecision(100).replace(/0+$/, "");
  const [inteiro, fracao = ""] = exato.split(".");
  let digitos = BigInt(inteiro + fracao.slice(0, 2).padEnd(2, "0"));
  const resto = fracao.slice(2);
  if (resto) {
    const c = resto[0] > "5" || (resto[0] === "5" && /[1-9]/.test(resto.slice(1))) ? 1 : resto[0] < "5" ? -1 : 0;
    if (c > 0 || (c === 0 && digitos % BigInt(2) === BigInt(1))) digitos += BigInt(1);
  }
  const s = digitos.toString().padStart(3, "0");
  return (negativo ? "-" : "") + s.slice(0, -2) + "." + s.slice(-2);
}

/** `str(datetime)` do Python. */
function dataHoraPython(d: Date): string {
  const p = (n: number, t = 2) => String(n).padStart(t, "0");
  const base = `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  return d.getUTCMilliseconds() ? base + "." + p(d.getUTCMilliseconds() * 1000, 6) : base;
}

/** Valor de célula como o `fmt` do original: número com duas casas e vírgula; o resto como texto. */
function celula(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "1,00" : "0,00";
  if (typeof v === "number") return formato2f(v).replace(".", ",");
  if (v instanceof Date) return dataHoraPython(v);
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("") || "";
    if ("result" in o || "formula" in o || "sharedFormula" in o) return celula(o.result);
    if ("error" in o) return String(o.error);
    if ("text" in o) return celula(o.text);
  }
  return String(v);
}

/** Abas de um .xlsx como (título, linhas de valores), da linha 1 à última e da coluna 1 à última. */
async function abasDoXlsx(raw: Uint8Array): Promise<[string, unknown[][]][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(raw) as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const linhas: unknown[][] = [];
    const colunas = ws.columnCount;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const valores: unknown[] = [];
      for (let c = 1; c <= colunas; c++) valores.push(row.getCell(c).value);
      linhas.push(valores);
    }
    return [ws.name, linhas];
  });
}

/** Fatos de um arquivo (PDF com texto, CSV/TXT ou Excel .xlsx). */
export async function extractFile(name: string, raw: Uint8Array): Promise<Fatos> {
  const ext = sufixo(name).toLowerCase();
  let pages: string[];
  const warnings: string[] = [];
  let grids: [string, string][] = [];
  if (ext === ".pdf") {
    pages = await paginasDoPdf(raw);
    if (pages.reduce((s, p) => s + len(strip(p)), 0) < 40) warnings.push("PDF sem texto legível. OCR prévio necessário; nenhum valor presumido.");
  } else if (ext === ".csv" || ext === ".txt") {
    pages = [decodificarTexto(raw)];
  } else if (ext === ".xlsx") {
    const sheets = await abasDoXlsx(raw);
    for (const [title, rows] of sheets) {
      if (rows.length > 50000) throw new Error("Aba ultrapassa 50.000 linhas.");
      grids.push([title, escreverCsv(rows.map((r) => r.map(celula)))]);
    }
    pages = grids.map(([, t]) => t);
  } else if (ext === ".xls") {
    throw new Error("Planilha .xls (Excel 97-2003) não é lida no Connect: salve como .xlsx ou CSV e envie de novo.");
  } else throw new Error("Formato não suportado nesta execução: " + ext);
  const facts = parsePages(pages);
  if (ext === ".csv" || ext === ".txt") {
    const rows = csvAccounts(pages[0]);
    if (rows !== null) {
      facts.accounts = rows;
      facts.kind = "Balancete CSV";
    }
  }
  if (ext === ".xlsx") {
    const rows: ContaBalancete[] = [];
    grids.forEach(([title, text], i) => {
      const parsed = csvAccounts(text);
      if (parsed !== null) {
        for (const r of parsed) {
          r.page = i + 1;
          r.sheet = title;
        }
        rows.push(...parsed);
      }
    });
    if (rows.length) {
      facts.accounts = rows;
      facts.kind = "Balancete Excel";
    } else warnings.push("Planilha sem cabeçalhos reconhecidos. Use o modelo CSV/Excel de balancete; conteúdo textual extraído, sem inventar colunas.");
  }
  grids = [];
  const parseWarnings = facts.parseWarnings ?? [];
  delete facts.parseWarnings;
  facts.warnings = [...warnings, ...parseWarnings];
  facts.pageTexts = pages;
  return facts;
}

// ─── ZIP ──────────────────────────────────────────────────────────────────

const MB = 1024 * 1024;
const CP437 =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

type EntradaZip = { nome: string; flags: number; metodo: number; crc: number; comprimido: number; tamanho: number; offset: number };

function lerCentral(raw: Uint8Array): EntradaZip[] {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let eocd = -1;
  for (let i = raw.length - 22; i >= Math.max(0, raw.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("File is not a zip file");
  const total = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out: EntradaZip[] = [];
  for (let k = 0; k < total; k++) {
    if (p + 46 > raw.length || v.getUint32(p, true) !== 0x02014b50) throw new Error("Bad magic number for central directory");
    const flags = v.getUint16(p + 8, true);
    const metodo = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const comprimido = v.getUint32(p + 20, true);
    const tamanho = v.getUint32(p + 24, true);
    const n = v.getUint16(p + 28, true);
    const extra = v.getUint16(p + 30, true);
    const comentario = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    const bytes = raw.subarray(p + 46, p + 46 + n);
    let nome = flags & 0x800 ? new TextDecoder("utf-8").decode(bytes) : Array.from(bytes, (b) => (b < 0x80 ? String.fromCharCode(b) : CP437[b - 0x80])).join("");
    const nulo = nome.indexOf("\u0000");
    if (nulo >= 0) nome = nome.slice(0, nulo);
    out.push({ nome, flags, metodo, crc, comprimido, tamanho, offset });
    p += 46 + n + extra + comentario;
  }
  return out;
}

const CRC_TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function lerEntrada(raw: Uint8Array, e: EntradaZip): Uint8Array {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  if (v.getUint32(e.offset, true) !== 0x04034b50) throw new Error("Bad magic number for file header");
  const inicio = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const dados = raw.subarray(inicio, inicio + e.comprimido);
  let saida: Uint8Array;
  if (e.metodo === 0) saida = dados.slice();
  else if (e.metodo === 8) saida = inflateSync(dados, { out: new Uint8Array(e.tamanho) });
  else throw new Error("That compression method is not supported");
  if (crc32(saida) !== e.crc) throw new Error(`Bad CRC-32 for file '${e.nome}'`);
  return saida;
}

/** Arquivos de um ZIP (ou o próprio arquivo, se não for ZIP), com as travas do original contra caminho e tamanho. */
export function unpack(name: string, raw: Uint8Array): [string, Uint8Array][] {
  if (sufixo(name).toLowerCase() !== ".zip") return [[name, raw]];
  const results: [string, Uint8Array][] = [];
  let total = 0;
  const infos = lerCentral(raw);
  if (infos.length > 100) throw new Error("ZIP com mais de 100 itens.");
  for (const info of infos) {
    if (info.nome.endsWith("/")) continue;
    if (info.flags & 1) throw new Error("ZIP protegido por senha não suportado.");
    if (info.nome.split("/").includes("..") || info.nome.startsWith("/")) throw new Error("Caminho inválido no ZIP.");
    if (info.tamanho > 25 * MB) throw new Error("Arquivo no ZIP ultrapassa 25 MB.");
    total += info.tamanho;
    if (total > 80 * MB) throw new Error("ZIP descompactado ultrapassa 80 MB.");
    if (info.tamanho / Math.max(info.comprimido, 1) > 250) throw new Error("Taxa de compressão excede o limite de proteção.");
    if ([".pdf", ".xlsx", ".xls", ".csv", ".txt"].includes(sufixo(info.nome).toLowerCase())) results.push([nomeBase(info.nome), lerEntrada(raw, info)]);
  }
  if (!results.length) throw new Error("ZIP sem PDF, Excel, CSV ou TXT suportado.");
  return results;
}

