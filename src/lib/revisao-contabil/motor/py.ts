// Comportamentos do Python que o motor da Revisão contábil usa e que o JavaScript faz diferente.
// O motor foi portado de Python (AudTool, `dist/engine.py`); o resultado tem de ser o mesmo, por isso
// cada diferença que muda saída está aqui, num lugar só:
// - regex: `\b`, `\w`, `\d` e `\s` do Python enxergam letra acentuada, dígito e espaço Unicode; `^`/`$`
//   com MULTILINE só olham o `\n`; `(?P<nome>)`; `match` ancora no início e `fullmatch` nas duas pontas;
// - `str.split()`, `str.strip()` e `str.splitlines()` cortam em mais caracteres que `\s` e `\n`;
// - lista, dicionário e conjunto vazios são falsos;
// - `len()` e fatias contam caractere (code point), não unidade UTF-16;
// - `Decimal(...).quantize(1)` arredonda meio-para-par.

/** Espaços do `str.isspace()` (e do `\s` do `re` em texto). */
const ESPACOS = "\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const ESPACO_RE = new RegExp(`[${ESPACOS}]+`, "u");
const PALAVRA = "\\p{L}\\p{N}_";
const LIMITE = `(?:(?<=[${PALAVRA}])(?![${PALAVRA}])|(?<![${PALAVRA}])(?=[${PALAVRA}]))`;
const NAO_LIMITE = `(?:(?<=[${PALAVRA}])(?=[${PALAVRA}])|(?<![${PALAVRA}])(?![${PALAVRA}]))`;
/** Caracteres que o `re` do JavaScript aceita escapados no modo `u` fora de classe. */
const SINTAXE = new Set("^$\\.*+?()[]{}|/".split(""));

/**
 * Traduz um padrão do `re` do Python para o RegExp do JavaScript (modo `u`), com a semântica do Python.
 * Flags do Python: `s` (DOTALL), `m` (MULTILINE).
 */
export function traduzir(padrao: string, flags = ""): string {
  const dotall = flags.includes("s");
  const multiline = flags.includes("m");
  let out = "";
  let classe = false;
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === "\\") {
      const n = padrao[++i];
      if (n === undefined) throw new Error("padrão termina em \\");
      if (classe) {
        if (n === "w") out += PALAVRA;
        else if (n === "d") out += "\\p{Nd}";
        else if (n === "s") out += ESPACOS;
        else if ("nrtvf\\]-^".includes(n)) out += "\\" + n;
        else if (/[A-Za-z0-9]/.test(n)) throw new Error(`escape \\${n} em classe não traduzido`);
        else out += SINTAXE.has(n) ? "\\" + n : n;
        continue;
      }
      if (n === "b") out += LIMITE;
      else if (n === "B") out += NAO_LIMITE;
      else if (n === "w") out += `[${PALAVRA}]`;
      else if (n === "W") out += `[^${PALAVRA}]`;
      else if (n === "d") out += "\\p{Nd}";
      else if (n === "D") out += "\\P{Nd}";
      else if (n === "s") out += `[${ESPACOS}]`;
      else if (n === "S") out += `[^${ESPACOS}]`;
      else if (/[1-9]/.test(n)) out += "\\" + n;
      else if ("nrtvf".includes(n)) out += "\\" + n;
      else if (/[A-Za-z0-9]/.test(n)) throw new Error(`escape \\${n} não traduzido`);
      else out += SINTAXE.has(n) ? "\\" + n : n === "-" ? "\\x2d" : n;
      continue;
    }
    if (classe) {
      if (c === "]") classe = false;
      out += c;
      continue;
    }
    if (c === "[") {
      classe = true;
      out += c;
      if (padrao[i + 1] === "^") out += padrao[++i];
      if (padrao[i + 1] === "]") out += "\\" + padrao[++i]; // ']' logo no início é literal no Python
      continue;
    }
    if (c === "(" && padrao.startsWith("(?P<", i)) {
      out += "(?<";
      i += 3;
      continue;
    }
    if (c === "(" && padrao.startsWith("(?P=", i)) {
      const fim = padrao.indexOf(")", i);
      out += `\\k<${padrao.slice(i + 4, fim)}>`;
      i = fim;
      continue;
    }
    if (c === ".") out += dotall ? "[\\s\\S]" : "[^\\n]";
    else if (c === "^") out += multiline ? "(?:(?<![\\s\\S])|(?<=\\n))" : "(?<![\\s\\S])";
    else if (c === "$") out += multiline ? "(?:(?![\\s\\S])|(?=\\n))" : "(?=\\n?(?![\\s\\S]))";
    else out += c;
  }
  return out;
}

/** Um match no formato do Python: grupo que não participou é `null`. */
export type Casamento = {
  readonly [indice: number]: string | null;
  readonly inicio: number;
  readonly fim: number;
  readonly grupos: (string | null)[];
};

function casamento(m: RegExpExecArray): Casamento {
  const grupos = Array.from(m, (x) => (x === undefined ? null : x));
  return Object.assign(grupos.slice(), { inicio: m.index, fim: m.index + m[0].length, grupos: grupos.slice(1) });
}

/** Um padrão compilado do `re` do Python. */
export class Re {
  private readonly busca: RegExp;
  private readonly inicio: RegExp;
  private readonly inteiro: RegExp;
  private readonly todos: RegExp;
  constructor(readonly padrao: string, flags = "") {
    const js = traduzir(padrao, flags);
    this.busca = new RegExp(js, "u");
    this.inicio = new RegExp(js, "uy");
    this.inteiro = new RegExp(`(?:${js})(?![\\s\\S])`, "uy");
    this.todos = new RegExp(js, "gu");
  }
  /** `re.search` */
  search(texto: string): Casamento | null {
    const m = this.busca.exec(texto);
    return m && casamento(m);
  }
  /** `re.match`: ancorado no início. */
  match(texto: string): Casamento | null {
    this.inicio.lastIndex = 0;
    const m = this.inicio.exec(texto);
    return m && casamento(m);
  }
  /** `re.fullmatch`: o texto inteiro. */
  fullmatch(texto: string): Casamento | null {
    this.inteiro.lastIndex = 0;
    const m = this.inteiro.exec(texto);
    return m && casamento(m);
  }
  /** `re.finditer` */
  finditer(texto: string): Casamento[] {
    const out: Casamento[] = [];
    this.todos.lastIndex = 0;
    for (let m = this.todos.exec(texto); m; m = this.todos.exec(texto)) {
      out.push(casamento(m));
      if (m[0] === "") this.todos.lastIndex += texto.codePointAt(m.index)! > 0xffff ? 2 : 1;
    }
    return out;
  }
  /** `re.findall`: sem grupo, o texto; com um, o grupo; com vários, a tupla (grupo ausente = ""). */
  findall(texto: string): (string | string[])[] {
    return this.finditer(texto).map((m) =>
      m.grupos.length === 0 ? (m[0] as string) : m.grupos.length === 1 ? (m.grupos[0] ?? "") : m.grupos.map((g) => g ?? ""),
    );
  }
  /** `re.sub` com texto fixo (sem referência a grupo). */
  sub(troca: string, texto: string): string {
    return texto.replace(this.todos, () => troca);
  }
}

const cache = new Map<string, Re>();
/** Padrão compilado e guardado, como o cache do `re`. */
export function re(padrao: string, flags = ""): Re {
  const chave = flags + "\u0000" + padrao;
  let r = cache.get(chave);
  if (!r) cache.set(chave, (r = new Re(padrao, flags)));
  return r;
}

/** `re.escape` para montar padrão a partir de texto literal. */
export function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
}

// ─── Texto ────────────────────────────────────────────────────────────────

/** `str.split()` sem argumento. */
export function split(texto: string): string[] {
  return texto.split(ESPACO_RE).filter(Boolean);
}

const ESPACO_SET = new Set(
  Array.from({ length: 0x3001 }, (_, i) => String.fromCharCode(i)).filter((c) => new RegExp(`^[${ESPACOS}]$`, "u").test(c)),
);

/** `str.strip()`, ou `str.strip(chars)` com os caracteres dados. */
export function strip(texto: string, chars?: string): string {
  const tira = chars === undefined ? (c: string) => ESPACO_SET.has(c) : (c: string) => chars.includes(c);
  let a = 0;
  let b = texto.length;
  while (a < b && tira(texto[a])) a++;
  while (b > a && tira(texto[b - 1])) b--;
  return texto.slice(a, b);
}

const FIM_DE_LINHA = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;
/** `str.splitlines()`: corta em `\r\n` e nos outros fins de linha do Python, sem item vazio no fim. */
export function splitlines(texto: string): string[] {
  if (!texto) return [];
  const partes = texto.split(new RegExp(FIM_DE_LINHA.source, "g"));
  if (partes[partes.length - 1] === "") partes.pop();
  return partes;
}

/** `len(str)`: caracteres (code points). */
export function len(texto: string): number {
  let n = texto.length;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < texto.length) {
      const d = texto.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        n--;
        i++;
      }
    }
  }
  return n;
}

/** `str[:n]` em caracteres (code points). */
export function corta(texto: string, n: number): string {
  if (texto.length <= n) return texto;
  return Array.from(texto).slice(0, n).join("");
}

/** `str.count(sub)` sem sobreposição. */
export function conta(texto: string, sub: string): number {
  if (!sub) return len(texto) + 1;
  let n = 0;
  for (let i = texto.indexOf(sub); i >= 0; i = texto.indexOf(sub, i + sub.length)) n++;
  return n;
}

/** `'%02d' % n` */
export function d2(n: number): string {
  return (n < 0 ? "-" : "") + String(Math.abs(n)).padStart(2, "0");
}

/** `'{:,}'.format(n)` para inteiro. */
export function milhar(n: number): string {
  const s = String(Math.abs(n));
  return (n < 0 ? "-" : "") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Comparação de texto do Python (por code point). */
export function cmp(a: string, b: string): number {
  if (a === b) return 0;
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i].codePointAt(0)! - y[i].codePointAt(0)!;
  }
  return x.length - y.length;
}

/** Ordena textos como o `sorted()` do Python. */
export function ordenados(textos: Iterable<string>): string[] {
  return [...textos].sort(cmp);
}

/** Compara tuplas (arrays) elemento a elemento, como o Python. */
export function cmpTupla(a: readonly unknown[], b: readonly unknown[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === "string" && typeof y === "string") return cmp(x, y);
    if (typeof x === "boolean" || typeof y === "boolean") return Number(x) - Number(y);
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1;
    if (Array.isArray(x) && Array.isArray(y)) {
      const c = cmpTupla(x, y);
      if (c) return c;
      continue;
    }
    throw new Error(`comparação sem ordem: ${typeof x} × ${typeof y}`);
  }
  return a.length - b.length;
}

/** Verdade do Python: vazio é falso (lista, texto, dicionário, conjunto, mapa), zero é falso. */
export function verdade(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Number.isNaN(v)) return true;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** `max(itens, key=...)`: o primeiro maior. */
export function maxPor<T>(itens: readonly T[], chave: (x: T) => number): T {
  if (!itens.length) throw new Error("max() arg is an empty sequence");
  let melhor = itens[0];
  for (const x of itens) if (chave(x) > chave(melhor)) melhor = x;
  return melhor;
}

/** `sum()` */
export function soma(valores: Iterable<number>): number {
  let s = 0;
  for (const v of valores) s += v;
  return s;
}

/** `dict.fromkeys(...)`: sem repetidos, na ordem. */
export function unicos<T>(itens: Iterable<T>): T[] {
  return [...new Set(itens)];
}

/** `dict.setdefault(k, padrão)` para Map. */
export function padrao<K, V>(m: Map<K, V>, k: K, novo: () => V): V {
  let v = m.get(k);
  if (v === undefined) m.set(k, (v = novo()));
  return v;
}

// ─── Decimal ──────────────────────────────────────────────────────────────

const DECIMAL = /^([+-])?(?:(\d(?:_?\d)*)(?:\.((?:\d(?:_?\d)*)?))?|\.(\d(?:_?\d)*))(?:[eE]([+-]?\d(?:_?\d)*))?$/;
const ESPECIAL = /^([+-])?(inf|infinity|s?nan\d*)$/i;

/**
 * `int((Decimal(texto) * 100).quantize(Decimal('1')))`: centavos com arredondamento meio-para-par.
 * `undefined` quando o `Decimal` recusaria o texto (InvalidOperation); lança como o `int()` do Python
 * lançaria com NaN.
 */
export function centavosDecimal(texto: string): number | undefined {
  const t = strip(texto);
  const esp = ESPECIAL.exec(t);
  if (esp) {
    if (/nan/i.test(esp[2])) throw new Error("cannot convert NaN to integer");
    return undefined; // Infinity: quantize recusa
  }
  const m = DECIMAL.exec(t);
  if (!m) return undefined;
  const negativo = m[1] === "-";
  const inteiro = (m[2] ?? "").replace(/_/g, "");
  const fracao = (m[4] ?? m[3] ?? "").replace(/_/g, "");
  const expoente = Number((m[5] ?? "0").replace(/_/g, "")) + 2; // ×100
  let digitos = (inteiro + fracao).replace(/^0+(?=\d)/, "") || "0";
  let escala = fracao.length - expoente; // valor = digitos × 10^-escala
  if (escala <= 0) {
    digitos += "0".repeat(-escala);
    escala = 0;
  }
  let inteiros = BigInt(escala >= digitos.length ? "0" : digitos.slice(0, digitos.length - escala) || "0");
  if (escala > 0) {
    const resto = digitos.length >= escala ? digitos.slice(digitos.length - escala) : digitos.padStart(escala, "0");
    const metade = "5" + "0".repeat(escala - 1);
    const c = resto === metade ? 0 : resto > metade ? 1 : -1;
    if (c > 0 || (c === 0 && inteiros % BigInt(2) === BigInt(1))) inteiros += BigInt(1);
  }
  const v = Number(inteiros);
  return negativo ? -v : v;
}
