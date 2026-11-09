// Comportamentos do Python que o Contábil Core usa e que o JavaScript faz diferente.
//
// A base (regex com a semântica do `re`, `str.split()`, `str.strip()`, `len()`) é a mesma da Revisão
// contábil e vem de `src/lib/revisao-contabil/motor/py.ts`. Aqui ficam só os acréscimos deste porte:
// - `unicodedata.combining` e `unicodedata.decimal`, que o JavaScript não expõe (tabelas geradas do
//   Python em `unicodePython.ts`);
// - `str.casefold()`;
// - `json.dumps(..., sort_keys=True)` com `ensure_ascii`, que é a base da chave de duplicidade;
// - regex com IGNORECASE.

import { traduzir } from "@/lib/revisao-contabil/motor/py";
import { COMBINANTES, ZEROS } from "./unicodePython";

export { len, split, strip, re, cmp, ordenados } from "@/lib/revisao-contabil/motor/py";

function naFaixa(cp: number): boolean {
  let a = 0;
  let b = COMBINANTES.length - 1;
  while (a <= b) {
    const m = (a + b) >> 1;
    const [ini, fim] = COMBINANTES[m];
    if (cp < ini) b = m - 1;
    else if (cp > fim) a = m + 1;
    else return true;
  }
  return false;
}

/** `unicodedata.combining(c) != 0` */
export function combinante(c: string): boolean {
  return naFaixa(c.codePointAt(0)!);
}

/** `unicodedata.decimal(c, None)`: o valor de um dígito decimal de qualquer escrita, ou `null`. */
export function digitoUnicode(c: string): number | null {
  const cp = c.codePointAt(0)!;
  if (!/^\p{Nd}$/u.test(c)) return null;
  let zero = -1;
  for (const z of ZEROS) {
    if (z > cp) break;
    zero = z;
  }
  const v = cp - zero;
  return zero >= 0 && v >= 0 && v <= 9 ? v : null;
}

/** `str.isdigit()` restrito ao que importa aqui: dígito decimal de qualquer escrita. */
export function ehDigito(c: string): boolean {
  return digitoUnicode(c) !== null;
}

/** `str.casefold()`: maiúscula e depois minúscula cobre o desdobramento (ß → ss, ﬁ → fi). */
export function casefold(texto: string): string {
  return texto.toUpperCase().toLowerCase();
}

/** Padrão do `re` do Python com as flags `i` (IGNORECASE), `s` (DOTALL) e `m` (MULTILINE). */
export function rePy(padrao: string, flags = ""): RegExp {
  const js = traduzir(padrao, flags.replace("i", ""));
  return new RegExp(js, `gu${flags.includes("i") ? "i" : ""}`);
}

/** `re.findall` de um padrão com no máximo um grupo. */
export function findall(r: RegExp, texto: string): string[] {
  const out: string[] = [];
  r.lastIndex = 0;
  for (let m = r.exec(texto); m; m = r.exec(texto)) {
    out.push(m.length > 1 ? (m[1] ?? "") : m[0]);
    if (m[0] === "") r.lastIndex += texto.codePointAt(m.index)! > 0xffff ? 2 : 1;
  }
  return out;
}

/** `re.search(...).group(1)` ou `null`. */
export function primeiroGrupo(r: RegExp, texto: string): string | null {
  r.lastIndex = 0;
  const m = r.exec(texto);
  return m ? (m[1] ?? null) : null;
}

const ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f",
};

/** Texto em JSON como o `json.dumps` do Python com `ensure_ascii=True` (o padrão). */
export function jsonTexto(texto: string): string {
  let out = '"';
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    const u = texto.charCodeAt(i);
    if (ESCAPES[c]) out += ESCAPES[c];
    else if (u < 0x20 || u > 0x7e) out += "\\u" + u.toString(16).padStart(4, "0");
    else out += c;
  }
  return out + '"';
}

/**
 * `json.dumps(objeto, sort_keys=True)` para um objeto plano de textos: separadores `", "` e `": "`,
 * chaves em ordem de ponto de código e fora do ASCII escapado em `\uXXXX` (par substituto acima do
 * plano básico). O `JSON.stringify` não faz nenhuma das três coisas.
 */
export function jsonDumpsOrdenado(objeto: Record<string, string>): string {
  const chaves = Object.keys(objeto).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + chaves.map((k) => `${jsonTexto(k)}: ${jsonTexto(objeto[k])}`).join(", ") + "}";
}
