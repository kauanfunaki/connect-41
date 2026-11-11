// Planilha .xlsx lida como o openpyxl do original lê (Fase 4b, 10/11/2026):
// `load_workbook(read_only=True, data_only=True)`, a primeira folha de `wb.worksheets`,
// `reset_dimensions()` e `iter_rows(values_only=True)`.
//
// O que precisa sair igual, porque muda o resultado do extrato:
// - número "1500" é `int` e "1500.5" é `float` (o `_cast_number` olha se há ".", "E" ou "e");
// - célula de número com formato de data vira `datetime` (o `is_date_format` do openpyxl decide
//   pelo código do formato), hora vira `time` e formato de duração vira `timedelta`;
// - linha que falta no XML sai vazia, e cada linha vai até a última célula presente nela (sem a
//   dimensão declarada, que o xlsx do BB traz errada);
// - fórmula vale o valor guardado (`data_only`), e texto compartilhado perde o "x005F_".
//
// O arquivo é zip (fflate). O XML é lido por um leitor pequeno daqui, que só precisa de tags,
// atributos e texto.

import { unzipSync, strFromU8 } from "fflate";
import { strDatahora, strDuracao, strHora, type Celula } from "./celula";

export class ErroXlsx extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroXlsx";
  }
}

// ─── XML mínimo ─────────────────────────────────────────────────────────────

type No = { nome: string; atributos: Record<string, string>; filhos: (No | string)[] };

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificarTexto(t: string): string {
  // Fim de linha normalizado como o parser de XML faz, antes das entidades (`&#13;` continua \r).
  return t.replace(/\r\n?/g, "\n").replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return ENTIDADES[e] ?? m;
  });
}

const local = (nome: string) => nome.slice(nome.indexOf(":") + 1);

/** Lê o XML numa árvore. Tags com prefixo ficam pelo nome local (o openpyxl resolve o namespace). */
function lerXml(xml: string): No {
  const raiz: No = { nome: "#raiz", atributos: {}, filhos: [] };
  const pilha: No[] = [raiz];
  const tag = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let ultimo = 0;
  for (let m = tag.exec(xml); m; m = tag.exec(xml)) {
    if (m.index > ultimo) pilha[pilha.length - 1].filhos.push(decodificarTexto(xml.slice(ultimo, m.index)));
    ultimo = tag.lastIndex;
    if (m[1] !== undefined) {
      pilha[pilha.length - 1].filhos.push(m[1]);
      continue;
    }
    if (!m[3]) continue; // comentário, instrução, DOCTYPE
    const nome = local(m[3]);
    if (m[2] === "/") {
      for (let i = pilha.length - 1; i > 0; i--) {
        if (pilha[i].nome === nome) {
          pilha.length = i;
          break;
        }
      }
      continue;
    }
    const atributos: Record<string, string> = {};
    for (const a of m[4].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) atributos[local(a[1])] = decodificarTexto(a[2] ?? a[3]);
    const no: No = { nome, atributos, filhos: [] };
    pilha[pilha.length - 1].filhos.push(no);
    if (m[5] !== "/") pilha.push(no);
  }
  return raiz;
}

const filhos = (no: No, nome: string) => no.filhos.filter((f): f is No => typeof f !== "string" && f.nome === nome);
const filho = (no: No, nome: string) => no.filhos.find((f): f is No => typeof f !== "string" && f.nome === nome);
/** `element.text`: o texto antes do primeiro filho. */
function texto(no: No | undefined): string | null {
  if (!no) return null;
  let t = "";
  for (const f of no.filhos) {
    if (typeof f !== "string") break;
    t += f;
  }
  return no.filhos.length ? t : null;
}
function busca(no: No, nome: string): No | undefined {
  for (const f of no.filhos) {
    if (typeof f === "string") continue;
    if (f.nome === nome) return f;
    const r = busca(f, nome);
    if (r) return r;
  }
  return undefined;
}

// ─── Formatos de data (openpyxl/styles/numbers.py) ─────────────────────────

const FORMATOS_EMBUTIDOS: Record<number, string> = {
  0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00", 5: '"$"#,##0_);("$"#,##0)', 6: '"$"#,##0_);[Red]("$"#,##0)',
  7: '"$"#,##0.00_);("$"#,##0.00)', 8: '"$"#,##0.00_);[Red]("$"#,##0.00)', 9: "0%", 10: "0.00%", 11: "0.00E+00", 12: "# ?/?",
  13: "# ??/??", 14: "mm-dd-yy", 15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM", 19: "h:mm:ss AM/PM", 20: "h:mm",
  21: "h:mm:ss", 22: "m/d/yy h:mm", 37: "#,##0_);(#,##0)", 38: "#,##0_);[Red](#,##0)", 39: "#,##0.00_);(#,##0.00)",
  40: "#,##0.00_);[Red](#,##0.00)", 41: '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)', 42: '_("$"* #,##0_);_("$"* \\(#,##0\\);_("$"* "-"_);_(@_)',
  43: '_(* #,##0.00_);_(* \\(#,##0.00\\);_(* "-"??_);_(@_)', 44: '_("$"* #,##0.00_)_("$"* \\(#,##0.00\\)_("$"* "-"??_)_(@_)',
  45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
};
const STRIP_RE = /".*?"|\[(?!hh?\]|mm?\]|ss?\])[^\]]*\]/g;
const TIMEDELTA_RE = /\[hh?\](:mm(:ss(\.0*)?)?)?|\[mm?\](:ss(\.0*)?)?|\[ss?\](\.0*)?/i;

export function ehFormatoDeData(fmt: string | null): boolean {
  if (fmt === null) return false;
  const primeiro = fmt.split(";")[0].replace(STRIP_RE, "");
  return /(?<![_\\])[dmhysDMHYS]/.test(primeiro);
}
function ehFormatoDeDuracao(fmt: string | null): boolean {
  if (fmt === null) return false;
  return TIMEDELTA_RE.test(fmt.split(";")[0]);
}

// ─── Datas (openpyxl/utils/datetime.py `from_excel`) ───────────────────────

/** `round()` do Python: meio para o par. */
function arredondaPar(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

const MS_DIA = 86_400_000;

function deExcel(valor: number, epoca1904: boolean, duracao: boolean): Celula {
  if (duracao) {
    // `timedelta(days=valor)`, arredondado para milissegundo quando há fração de segundo.
    const totalMicro = Math.round(valor * 86_400 * 1e6);
    let micro = ((totalMicro % 1e6) + 1e6) % 1e6;
    let segundosTotais = (totalMicro - micro) / 1e6;
    if (micro) {
      micro = arredondaPar(micro / 1000) * 1000;
      if (micro === 1e6) {
        micro = 0;
        segundosTotais += 1;
      }
    }
    const dias = Math.floor(segundosTotais / 86_400);
    return { tipo: "duracao", valor: strDuracao(dias, segundosTotais - dias * 86_400, micro) };
  }
  let dia = Math.floor(valor);
  const fracao = valor - dia;
  const diffMs = arredondaPar(fracao * 86_400 * 1000);
  if (valor >= 0 && valor < 1 && diffMs < MS_DIA) {
    const s = Math.floor(diffMs / 1000);
    return { tipo: "hora", valor: strHora(Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60, (diffMs % 1000) * 1000) };
  }
  if (valor > 0 && valor < 60 && !epoca1904) dia += 1;
  const base = epoca1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const t = new Date(base + dia * MS_DIA + diffMs);
  const ano = t.getUTCFullYear();
  if (ano < 1 || ano > 9999) throw new RangeError("data fora do limite");
  return {
    tipo: "datahora",
    valor: strDatahora(ano, t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds(), t.getUTCMilliseconds() * 1000),
  };
}

/** `from_ISO8601` para célula `t="d"` (rara: o Excel grava data como número). */
function deIso(v: string): Celula {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?)?/.exec(v);
  if (!m) return v;
  if (!m[4]) return { tipo: "datahora", valor: `${m[1]}-${m[2]}-${m[3]}` }; // `date`: str() sem hora
  return { tipo: "datahora", valor: strDatahora(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6], m[7] ? +m[7].padEnd(6, "0") : 0) };
}

/** `_cast_number` */
function numero(v: string): { tipo: "int"; valor: bigint } | { tipo: "float"; valor: number } {
  if (v.includes(".") || v.includes("E") || v.includes("e")) return { tipo: "float", valor: Number(v) };
  return { tipo: "int", valor: BigInt(v.trim().replace(/^\+/, "")) };
}

/** `Text.content`: o texto simples e o das partes formatadas, sem a leitura fonética. */
function conteudoDeTexto(no: No): string {
  let t = "";
  const simples = filho(no, "t");
  if (simples) t += texto(simples) ?? "";
  for (const r of filhos(no, "r")) {
    const parte = filho(r, "t");
    if (parte) t += texto(parte) ?? "";
  }
  return t;
}

// ─── Leitura ────────────────────────────────────────────────────────────────

function caminho(base: string, alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = base.split("/").slice(0, -1);
  for (const p of alvo.split("/")) {
    if (p === "..") partes.pop();
    else if (p !== ".") partes.push(p);
  }
  return partes.join("/");
}

/** Converte coluna "AB" em número (1 = A). */
function coluna(ref: string): number {
  let n = 0;
  for (const c of ref.toUpperCase()) {
    const v = c.charCodeAt(0) - 64;
    if (v < 1 || v > 26) break;
    n = n * 26 + v;
  }
  return n;
}

/** Limite de descompressão: um extrato de verdade fica muito abaixo disto (bomba de zip). */
const MAX_DESCOMPRIMIDO = 200 * 1024 * 1024;

/** Uma folha lida: o título e as linhas de `iter_rows(values_only=True)`. */
export type FolhaXlsx = { nome: string; linhas: Celula[][] };

export type OpcoesXlsx = {
  /** "primeira": `wb.worksheets[0]`; "todas": `wb.worksheets`; "ativa": `wb.active`. */
  folhas: "primeira" | "todas" | "ativa";
  /** `iter_rows(max_row=...)`: linhas a mais que isso viram vazias até o limite. */
  maxLinha?: number;
  /** `iter_rows(max_col=...)`: cada linha sai com exatamente esse número de colunas. */
  maxColuna?: number;
};

/** As linhas da primeira folha, como `iter_rows(values_only=True)` do openpyxl. */
export function linhasDoXlsx(bytes: Uint8Array): Celula[][] {
  return lerXlsx(bytes, { folhas: "primeira" })[0]?.linhas ?? [];
}

/** O xlsx como o `load_workbook(read_only=True, data_only=True)` do openpyxl, com `reset_dimensions()`. */
export function lerXlsx(bytes: Uint8Array, opcoes: OpcoesXlsx): FolhaXlsx[] {
  let arquivos: Record<string, Uint8Array>;
  try {
    let total = 0;
    arquivos = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_DESCOMPRIMIDO) throw new ErroXlsx("A planilha descompactada é grande demais.");
        return /\.(xml|rels)$/i.test(f.name);
      },
    });
  } catch (e) {
    if (e instanceof ErroXlsx) throw e;
    throw new ErroXlsx("File is not a zip file");
  }
  const ler = (nome: string) => {
    const chave = Object.keys(arquivos).find((k) => k.toLowerCase() === nome.toLowerCase());
    return chave ? strFromU8(arquivos[chave]) : null;
  };

  const workbookXml = ler("xl/workbook.xml");
  if (!workbookXml) throw new ErroXlsx("There is no item named 'xl/workbook.xml' in the archive");
  const workbook = lerXml(workbookXml);
  const pr = busca(workbook, "workbookPr");
  const epoca1904 = ["1", "true"].includes((pr?.atributos.date1904 ?? "").toLowerCase());

  const rels = lerXml(ler("xl/_rels/workbook.xml.rels") ?? "");
  const alvos = new Map<string, { tipo: string; alvo: string }>();
  for (const r of filhos(busca(rels, "Relationships") ?? rels, "Relationship")) {
    alvos.set(r.atributos.Id, { tipo: r.atributos.Type ?? "", alvo: r.atributos.Target ?? "" });
  }
  const todas = filhos(busca(workbook, "sheets") ?? workbook, "sheet").map((f) => ({
    nome: f.atributos.name ?? "",
    rel: alvos.get(f.atributos.id),
  }));
  const ehFolha = (f: (typeof todas)[number]) => !!f.rel && f.rel.tipo.endsWith("/worksheet");
  let escolhidas: typeof todas;
  if (opcoes.folhas === "ativa") {
    // `wb.active`: o índice `activeTab` da primeira `workbookView`, entre TODAS as folhas.
    const vista = busca(workbook, "workbookView");
    const ativa = todas[Number(vista?.atributos.activeTab ?? 0)] ?? todas[0];
    escolhidas = ativa && ehFolha(ativa) ? [ativa] : [];
  } else {
    escolhidas = todas.filter(ehFolha);
    if (opcoes.folhas === "primeira") escolhidas = escolhidas.slice(0, 1);
  }
  if (!escolhidas.length) throw new ErroXlsx("A planilha não tem folha de dados.");

  // Textos compartilhados.
  const compartilhados: string[] = [];
  const sstXml = ler("xl/sharedStrings.xml");
  if (sstXml) {
    const sst = lerXml(sstXml);
    for (const si of filhos(busca(sst, "sst") ?? sst, "si")) compartilhados.push(conteudoDeTexto(si).replaceAll("x005F_", ""));
  }

  // Estilos: que índices de `cellXfs` são data e duração (`_normalise_numbers`).
  const datas = new Set<number>();
  const duracoes = new Set<number>();
  const stylesXml = ler("xl/styles.xml");
  if (stylesXml) {
    const estilos = lerXml(stylesXml);
    const personalizados = new Map<number, string>();
    const numFmts = busca(estilos, "numFmts");
    if (numFmts) for (const f of filhos(numFmts, "numFmt")) personalizados.set(Number(f.atributos.numFmtId), f.atributos.formatCode ?? "");
    const cellXfs = busca(estilos, "cellXfs");
    if (cellXfs) {
      filhos(cellXfs, "xf").forEach((xf, i) => {
        const id = Number(xf.atributos.numFmtId ?? 0);
        const fmt = personalizados.has(id) ? personalizados.get(id)! : (FORMATOS_EMBUTIDOS[id] ?? null);
        if (ehFormatoDeData(fmt)) datas.add(i);
        if (ehFormatoDeDuracao(fmt)) duracoes.add(i);
      });
    }
  }

  return escolhidas.map((f) => {
    const caminhoDaFolha = caminho("xl/workbook.xml", f.rel!.alvo);
    const folhaXml = ler(caminhoDaFolha);
    if (folhaXml === null) throw new ErroXlsx(`There is no item named '${caminhoDaFolha}' in the archive`);
    return { nome: f.nome, linhas: linhasDaFolha(lerXml(folhaXml), compartilhados, datas, duracoes, epoca1904, opcoes) };
  });
}

/** `ReadOnlyWorksheet._cells_by_row` + `_get_row`, com `values_only=True`. */
function linhasDaFolha(
  folha: No,
  compartilhados: string[],
  datas: Set<number>,
  duracoes: Set<number>,
  epoca1904: boolean,
  opcoes: OpcoesXlsx,
): Celula[][] {
  const dados = busca(folha, "sheetData");
  if (!dados) return [];
  const maxLinha = opcoes.maxLinha;
  const maxColuna = opcoes.maxColuna;
  // Com `max_col`, a linha vazia tem largura fixa; sem ele, é uma tupla vazia.
  const vazia = (): Celula[] => (maxColuna ? new Array<Celula>(maxColuna).fill(null) : []);

  const linhas: Celula[][] = [];
  let contadorDeLinha = 0;
  let esperada = 1;
  let ultima = 0;
  for (const row of filhos(dados, "row")) {
    contadorDeLinha = row.atributos.r ? Number(row.atributos.r) : contadorDeLinha + 1;
    ultima = contadorDeLinha;
    if (maxLinha !== undefined && contadorDeLinha > maxLinha) break;
    let contadorDeColuna = 0;
    const celulas: { coluna: number; valor: Celula }[] = [];
    for (const c of filhos(row, "c")) {
      const tipo = c.atributos.t ?? "n";
      const estilo = c.atributos.s ? Number(c.atributos.s) : 0;
      contadorDeColuna = c.atributos.r ? coluna(c.atributos.r) : contadorDeColuna + 1;
      let valor: Celula = null;
      if (tipo === "inlineStr") {
        const is = filho(c, "is");
        valor = is ? conteudoDeTexto(is) : null;
      } else {
        const bruto = texto(filho(c, "v"));
        if (bruto) {
          if (tipo === "n") {
            const num = numero(bruto);
            valor = num;
            if (datas.has(estilo)) {
              const n = num.tipo === "int" ? Number(num.valor) : num.valor;
              try {
                valor = deExcel(n, epoca1904, duracoes.has(estilo));
              } catch {
                valor = "#VALUE!";
              }
            }
          } else if (tipo === "s") valor = compartilhados[Number(bruto)] ?? null;
          else if (tipo === "b") valor = { tipo: "bool", valor: Number(bruto) !== 0 };
          else if (tipo === "d") valor = deIso(bruto);
          else valor = bruto; // "str", "e"
        }
      }
      celulas.push({ coluna: contadorDeColuna, valor });
    }
    // Linhas que faltam no XML saem vazias.
    for (; esperada < contadorDeLinha; esperada++) linhas.push(vazia());
    if (esperada <= contadorDeLinha) {
      if (!celulas.length && !maxColuna) linhas.push([]);
      else {
        const largura = maxColuna ?? celulas[celulas.length - 1].coluna;
        const linha: Celula[] = new Array<Celula>(largura).fill(null);
        for (const c of celulas) if (c.coluna >= 1 && c.coluna <= largura) linha[c.coluna - 1] = c.valor;
        linhas.push(linha);
      }
      esperada++;
    }
  }
  // Com `max_row` e mais linhas no arquivo, as que faltam até o limite saem vazias.
  if (maxLinha !== undefined && maxLinha < ultima) for (; esperada <= maxLinha; esperada++) linhas.push(vazia());
  return linhas;
}
