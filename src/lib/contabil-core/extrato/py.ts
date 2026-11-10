// O `re` do Python como os leitores de extrato usam (Fase 4, 10/11/2026). A tradução do padrão
// (`\b`, `\d`, `\s` e `\w` Unicode, `(?P<nome>)`, `^`/`$`) é a da Revisão contábil
// (`revisao-contabil/motor/py.ts`); aqui entram o que os leitores precisam a mais:
// - as flags `re.IGNORECASE` ("i"), `re.DOTALL` ("s") e `re.MULTILINE` ("m"), também inline no
//   começo do padrão (`(?im)`);
// - `re.sub` com referência a grupo (`\1`, `\g<1>`, `\g<nome>`), com função e com `count`;
// - `re.split` com `maxsplit`, devolvendo os grupos como o Python.

import { traduzir } from "@/lib/revisao-contabil/motor/py";
import { digitoUnicode } from "../motor/unicodePy";

export { corta, split, strip, splitlines, len } from "@/lib/revisao-contabil/motor/py";

/** Um match no formato do Python: grupo que não participou é `null`. */
export type Casamento = {
  readonly [indice: number]: string | null;
  readonly inicio: number;
  readonly fim: number;
  readonly grupos: (string | null)[];
  readonly nomeados: Record<string, string | null>;
  /** `m.group(n)` ou `m.group("nome")`. */
  grupo(n: number | string): string | null;
};

function casamento(m: RegExpExecArray): Casamento {
  const grupos = Array.from(m, (x) => (x === undefined ? null : x));
  const nomeados: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(m.groups ?? {})) nomeados[k] = v === undefined ? null : v;
  return Object.assign(grupos.slice(), {
    inicio: m.index,
    fim: m.index + m[0].length,
    grupos: grupos.slice(1),
    nomeados,
    grupo(n: number | string) {
      return typeof n === "number" ? (grupos[n] ?? null) : (nomeados[n] ?? null);
    },
  });
}

/** Troca um modelo de `re.sub` (`\1`, `\g<1>`, `\g<nome>`, `\n`) pelo texto do casamento. */
function aplicarModelo(modelo: string, m: Casamento): string {
  let out = "";
  for (let i = 0; i < modelo.length; i++) {
    const c = modelo[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = modelo[++i];
    if (n === "g" && modelo[i + 1] === "<") {
      const fim = modelo.indexOf(">", i);
      const nome = modelo.slice(i + 2, fim);
      out += (/^\d+$/.test(nome) ? m.grupo(Number(nome)) : m.grupo(nome)) ?? "";
      i = fim;
    } else if (n !== undefined && /\d/.test(n)) {
      let num = n;
      if (/\d/.test(modelo[i + 1] ?? "")) num += modelo[++i];
      out += m.grupo(Number(num)) ?? "";
    } else if (n === "n") out += "\n";
    else if (n === "t") out += "\t";
    else if (n === "r") out += "\r";
    else if (n === "\\") out += "\\";
    else out += "\\" + (n ?? "");
  }
  return out;
}

/** Um padrão compilado do `re` do Python. */
export class Re {
  private readonly busca: RegExp;
  private readonly inicio: RegExp;
  private readonly inteiro: RegExp;
  private readonly todos: RegExp;
  constructor(
    readonly padrao: string,
    flags = "",
  ) {
    let p = padrao;
    let f = flags;
    const inline = /^\(\?([aiLmsux]+)\)/.exec(p);
    if (inline) {
      f += inline[1];
      p = p.slice(inline[0].length);
    }
    const js = traduzir(p, f);
    const i = f.includes("i") ? "i" : "";
    this.busca = new RegExp(js, "u" + i);
    this.inicio = new RegExp(js, "uy" + i);
    this.inteiro = new RegExp(`(?:${js})(?![\\s\\S])`, "uy" + i);
    this.todos = new RegExp(js, "gu" + i);
  }
  /** `re.search` (com `pos`, como `padrao.search(texto, pos)`). */
  search(texto: string, pos = 0): Casamento | null {
    if (pos === 0) {
      const m = this.busca.exec(texto);
      return m && casamento(m);
    }
    this.todos.lastIndex = pos;
    const m = this.todos.exec(texto);
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
  /** `re.findall` de padrão com um grupo só (ou nenhum): a lista de textos. */
  findallTextos(texto: string): string[] {
    return this.findall(texto) as string[];
  }
  /** `re.sub(padrao, troca, texto, count=n)`; `troca` é modelo do Python ou função. */
  sub(troca: string | ((m: Casamento) => string), texto: string, count = 0): string {
    let out = "";
    let ultimo = 0;
    let feitos = 0;
    for (const m of this.finditer(texto)) {
      if (count > 0 && feitos >= count) break;
      out += texto.slice(ultimo, m.inicio) + (typeof troca === "function" ? troca(m) : aplicarModelo(troca, m));
      ultimo = m.fim;
      feitos++;
    }
    return out + texto.slice(ultimo);
  }
  /** `re.split(padrao, texto, maxsplit=n)`, com os grupos do padrão no meio, como o Python. */
  split(texto: string, maxsplit = 0): (string | null)[] {
    const out: (string | null)[] = [];
    let ultimo = 0;
    let feitos = 0;
    for (const m of this.finditer(texto)) {
      if (maxsplit > 0 && feitos >= maxsplit) break;
      out.push(texto.slice(ultimo, m.inicio), ...m.grupos);
      ultimo = m.fim;
      feitos++;
    }
    out.push(texto.slice(ultimo));
    return out;
  }
}

const cache = new Map<string, Re>();
/** Padrão compilado e guardado, como o cache do `re`. Flags: "i", "s", "m". */
export function re(padrao: string, flags = ""): Re {
  const chave = flags + "\u0000" + padrao;
  let r = cache.get(chave);
  if (!r) cache.set(chave, (r = new Re(padrao, flags)));
  return r;
}

/** `int(texto)` de dígitos já casados por `\d` (que no Python aceita dígito de qualquer escrita). */
export function inteiro(texto: string): number {
  let n = 0;
  for (const c of texto.trim()) {
    const v = c >= "0" && c <= "9" ? c.charCodeAt(0) - 48 : digitoUnicode(c);
    if (v === null) throw new Error(`não é inteiro: ${texto}`);
    n = n * 10 + v;
  }
  return n;
}

/** `str.isdigit()` para o que aparece em extrato (dígitos decimais de qualquer escrita). */
export function ehDigitos(texto: string): boolean {
  return texto.length > 0 && /^\p{Nd}+$/u.test(texto);
}

/** `str.casefold()` aproximado pelo `toLowerCase` (o que os leitores comparam é ASCII e acento português). */
export function casefold(texto: string): string {
  return texto.toLowerCase().replace(/ß/g, "ss");
}

/** `sorted(xs, key=...)` estável, com chave numérica ou tupla de números. */
export function ordenarPor<T>(xs: readonly T[], chave: (x: T) => number | readonly number[]): T[] {
  return xs
    .map((x, i) => ({ x, i, k: chave(x) }))
    .sort((a, b) => {
      const ka = typeof a.k === "number" ? [a.k] : a.k;
      const kb = typeof b.k === "number" ? [b.k] : b.k;
      for (let j = 0; j < Math.max(ka.length, kb.length); j++) {
        const d = (ka[j] ?? 0) - (kb[j] ?? 0);
        if (d !== 0) return d;
      }
      return a.i - b.i;
    })
    .map((p) => p.x);
}
