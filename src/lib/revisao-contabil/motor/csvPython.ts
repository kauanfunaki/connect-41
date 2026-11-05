// O módulo `csv` do Python, na parte que o motor usa: o `Sniffer` (delimitador, aspas, `doublequote`),
// o leitor (`_csv.c`, com dialeto QUOTE_MINIMAL e sem escapechar), o `DictReader` e o escritor.
// O motor lê balancete em CSV e transforma planilha em CSV com eles; outro leitor de CSV daria outro
// resultado nas bordas (aspas, `doublequote` falso do Sniffer, espaço inicial), por isso a cópia.
// Fonte: CPython 3.14, `Lib/csv.py` e `Modules/_csv.c`.

import { conta, re } from "./py";

export type Dialeto = { delimiter: string; quotechar: string; doublequote: boolean; skipinitialspace: boolean };

/** `csv.excel` com ";" — o que o motor usa quando o Sniffer não decide. */
export const EXCEL_PONTO_E_VIRGULA: Dialeto = { delimiter: ";", quotechar: '"', doublequote: true, skipinitialspace: false };

/** `csv.Sniffer().sniff(amostra, delimiters)`, ou o `csv.excel` com ";" quando ele recusa. */
export function farejar(amostra: string, delimitadores: string): Dialeto {
  const r = sniff(amostra, delimitadores);
  return r ?? EXCEL_PONTO_E_VIRGULA;
}

function sniff(sample: string, delimiters: string): Dialeto | null {
  const [quotechar, doublequote, delimitadorPelasAspas, espacoPelasAspas] = guessQuoteAndDelimiter(sample, delimiters);
  let delimiter = delimitadorPelasAspas;
  let skipinitialspace = espacoPelasAspas;
  if (!delimiter) [delimiter, skipinitialspace] = guessDelimiter(sample, delimiters);
  if (!delimiter) return null; // csv.Error: Could not determine delimiter
  return { delimiter, quotechar: quotechar || '"', doublequote, skipinitialspace };
}

const QUOTE_RES: { padrao: string; grupos: Record<string, number> }[] = [
  { padrao: String.raw`(?P<delim>[^\w\n"\'])(?P<space> ?)(?P<quote>["\']).*?(?P=quote)(?P=delim)`, grupos: { delim: 0, space: 1, quote: 2 } },
  { padrao: String.raw`(?:^|\n)(?P<quote>["\']).*?(?P=quote)(?P<delim>[^\w\n"\'])(?P<space> ?)`, grupos: { quote: 0, delim: 1, space: 2 } },
  { padrao: String.raw`(?P<delim>[^\w\n"\'])(?P<space> ?)(?P<quote>["\']).*?(?P=quote)(?:$|\n)`, grupos: { delim: 0, space: 1, quote: 2 } },
  { padrao: String.raw`(?:^|\n)(?P<quote>["\']).*?(?P=quote)(?:$|\n)`, grupos: { quote: 0 } },
];

function maxChave(m: Map<string, number>): string {
  let melhor: string | null = null;
  for (const [k, v] of m) if (melhor === null || v > (m.get(melhor) as number)) melhor = k;
  return melhor as string;
}

function escaparPy(texto: string): string {
  // re.escape do Python 3.7+: ()[]{}?*+-|^$\.&~# e espaços.
  return texto.replace(/[()[\]{}?*+\-|^$\\.&~# \t\n\r\v\f]/g, "\\$&");
}

function guessQuoteAndDelimiter(data: string, delimiters: string): [string, boolean, string, boolean] {
  let matches: (string | null)[][] = [];
  let grupos: Record<string, number> = {};
  for (const r of QUOTE_RES) {
    matches = re(r.padrao, "sm").finditer(data).map((m) => m.grupos);
    grupos = r.grupos;
    if (matches.length) break;
  }
  if (!matches.length) return ["", false, "", false];
  const quotes = new Map<string, number>();
  const delims = new Map<string, number>();
  let spaces = 0;
  for (const m of matches) {
    let key = m[grupos.quote] ?? "";
    if (key) quotes.set(key, (quotes.get(key) ?? 0) + 1);
    if (!("delim" in grupos)) continue;
    key = m[grupos.delim] ?? "";
    if (key && delimiters.includes(key)) delims.set(key, (delims.get(key) ?? 0) + 1);
    if (!("space" in grupos)) continue;
    if (m[grupos.space]) spaces += 1;
  }
  const quotechar = maxChave(quotes);
  let delim: string;
  let skipinitialspace: boolean;
  if (delims.size) {
    delim = maxChave(delims);
    skipinitialspace = delims.get(delim) === spaces;
    if (delim === "\n") delim = "";
  } else {
    delim = "";
    skipinitialspace = false;
  }
  // Aspa a mais entre delimitadores: formato com aspas dobradas.
  const d = escaparPy(delim);
  const dq = re(String.raw`((${d})|^)\W*${quotechar}[^${d}\n]*${quotechar}[^${d}\n]*${quotechar}\W*((${d})|$)`, "m");
  return [quotechar, Boolean(dq.search(data)), delim, skipinitialspace];
}

function guessDelimiter(texto: string, delimiters: string): [string, boolean] {
  const data = texto.split("\n").filter(Boolean);
  const chunkLength = Math.min(10, data.length);
  let iteration = 0;
  const charFrequency = new Map<number, Map<number, number>>();
  const modes = new Map<number, [number, number]>();
  const delims = new Map<string, [number, number]>();
  let start = 0;
  let end = chunkLength;
  const skip = (delim: string) => conta(data[0], delim) === conta(data[0], delim + " ");
  while (start < data.length) {
    iteration += 1;
    for (const line of data.slice(start, end)) {
      const freq = new Array<number>(127).fill(0);
      for (let i = 0; i < line.length; i++) {
        const c = line.charCodeAt(i);
        if (c < 127) freq[c] += 1;
      }
      for (let ch = 0; ch < 127; ch++) {
        let meta = charFrequency.get(ch);
        if (!meta) charFrequency.set(ch, (meta = new Map()));
        meta.set(freq[ch], (meta.get(freq[ch]) ?? 0) + 1);
      }
    }
    for (const [ch, meta] of charFrequency) {
      const items = [...meta.entries()];
      if (items.length === 1 && items[0][0] === 0) continue;
      if (items.length > 1) {
        let moda = items[0];
        for (const it of items) if (it[1] > moda[1]) moda = it;
        const resto = items.filter((it) => it !== moda);
        modes.set(ch, [moda[0], moda[1] - resto.reduce((s, it) => s + it[1], 0)]);
      } else modes.set(ch, items[0]);
    }
    const total = Math.min(chunkLength * iteration, data.length);
    let consistency = 1.0;
    const threshold = 0.9;
    while (delims.size === 0 && consistency >= threshold) {
      for (const [k, v] of modes) {
        const ch = String.fromCharCode(k);
        if (v[0] > 0 && v[1] > 0 && v[1] / total >= consistency && delimiters.includes(ch)) delims.set(ch, v);
      }
      consistency -= 0.01;
    }
    if (delims.size === 1) {
      const delim = [...delims.keys()][0];
      return [delim, skip(delim)];
    }
    start = end;
    end += chunkLength;
  }
  if (!delims.size) return ["", false];
  for (const d of [",", "\t", ";", " ", ":"]) if (delims.has(d)) return [d, skip(d)];
  const items = [...delims.entries()].sort(([ka, va], [kb, vb]) => va[0] - vb[0] || va[1] - vb[1] || (ka < kb ? -1 : ka > kb ? 1 : 0));
  const delim = items[items.length - 1][0];
  return [delim, skip(delim)];
}

const FIELD_LIMIT = 131072;
type Estado = "START_RECORD" | "START_FIELD" | "IN_FIELD" | "IN_QUOTED_FIELD" | "QUOTE_IN_QUOTED_FIELD" | "EAT_CRNL";

/** `csv.reader(io.StringIO(texto), dialeto)`: os registros, na ordem. */
export function registros(texto: string, d: Dialeto): string[][] {
  // io.StringIO itera por "\n", que fica no fim de cada linha.
  const linhas: string[] = [];
  let i = 0;
  while (i < texto.length) {
    const j = texto.indexOf("\n", i);
    const fim = j < 0 ? texto.length : j + 1;
    linhas.push(texto.slice(i, fim));
    i = fim;
  }
  const out: string[][] = [];
  let estado: Estado = "START_RECORD";
  let campos: string[] = [];
  let campo = "";
  const salva = () => {
    campos.push(campo);
    campo = "";
  };
  const soma = (c: string) => {
    if (campo.length >= FIELD_LIMIT) throw new Error(`field larger than field limit (${FIELD_LIMIT})`);
    campo += c;
  };
  const processa = (c: string | null) => {
    switch (estado) {
      case "START_RECORD":
        if (c === null) return;
        if (c === "\n" || c === "\r") {
          estado = "EAT_CRNL";
          return;
        }
        estado = "START_FIELD";
      // falls through: o caractere comum começa um campo (START_FIELD)
      case "START_FIELD":
        if (c === "\n" || c === "\r" || c === null) {
          salva();
          estado = c === null ? "START_RECORD" : "EAT_CRNL";
        } else if (c === d.quotechar) estado = "IN_QUOTED_FIELD";
        else if (c === " " && d.skipinitialspace) {
          // espaço no início do campo é ignorado
        }
        else if (c === d.delimiter) salva();
        else {
          soma(c);
          estado = "IN_FIELD";
        }
        return;
      case "IN_FIELD":
        if (c === "\n" || c === "\r" || c === null) {
          salva();
          estado = c === null ? "START_RECORD" : "EAT_CRNL";
        } else if (c === d.delimiter) {
          salva();
          estado = "START_FIELD";
        } else soma(c);
        return;
      case "IN_QUOTED_FIELD":
        if (c === null) {
          // fim de linha dentro de aspas: o campo continua na linha seguinte
        } else if (c === d.quotechar) estado = d.doublequote ? "QUOTE_IN_QUOTED_FIELD" : "IN_FIELD";
        else soma(c);
        return;
      case "QUOTE_IN_QUOTED_FIELD":
        if (c === d.quotechar) {
          soma(c);
          estado = "IN_QUOTED_FIELD";
        } else if (c === d.delimiter) {
          salva();
          estado = "START_FIELD";
        } else if (c === "\n" || c === "\r" || c === null) {
          salva();
          estado = c === null ? "START_RECORD" : "EAT_CRNL";
        } else {
          soma(c as string);
          estado = "IN_FIELD";
        }
        return;
      case "EAT_CRNL":
        if (c === "\n" || c === "\r") {
          // o resto do fim de linha ("\r\n")
        } else if (c === null) estado = "START_RECORD";
        else throw new Error("new-line character seen in unquoted field - do you need to open the file with newline=''?");
        return;
    }
  };
  let l = 0;
  while (l < linhas.length) {
    campos = [];
    campo = "";
    estado = "START_RECORD";
    let fimDoTexto = false;
    do {
      if (l >= linhas.length) {
        fimDoTexto = true;
        break;
      }
      for (const c of linhas[l++]) processa(c);
      processa(null);
    } while (estado !== "START_RECORD");
    if (fimDoTexto) {
      // `estado` muda dentro de `processa`; o TypeScript não acompanha.
      if (campo.length !== 0 || (estado as Estado) === "IN_QUOTED_FIELD") {
        salva();
        out.push(campos);
      }
      break;
    }
    out.push(campos);
  }
  return out;
}

export type LinhaCsv = Map<string | null, string | string[] | null>;

/** `csv.DictReader`: o cabeçalho (`null` sem nenhum registro) e as linhas não vazias. */
export function lerCsv(texto: string, d: Dialeto): { campos: string[] | null; linhas: LinhaCsv[] } {
  const todos = registros(texto, d);
  if (!todos.length) return { campos: null, linhas: [] };
  const campos = todos[0];
  const linhas: LinhaCsv[] = [];
  for (const row of todos.slice(1)) {
    if (!row.length) continue;
    const m: LinhaCsv = new Map();
    campos.forEach((k, i) => {
      if (i < row.length) m.set(k, row[i]);
    });
    if (campos.length < row.length) m.set(null, row.slice(campos.length));
    else for (const k of campos.slice(row.length)) m.set(k, null);
    linhas.push(m);
  }
  return { campos, linhas };
}

/** `csv.writer(stream, delimiter=';').writerows(linhas)`: QUOTE_MINIMAL, fim de linha "\r\n". */
export function escreverCsv(linhas: string[][], delimitador = ";"): string {
  return linhas
    .map((linha) => {
      if (linha.length === 1 && linha[0] === "") return '""\r\n';
      return (
        linha
          .map((v) => (v.includes(delimitador) || v.includes('"') || v.includes("\n") || v.includes("\r") ? '"' + v.split('"').join('""') + '"' : v))
          .join(delimitador) + "\r\n"
      );
    })
    .join("");
}
