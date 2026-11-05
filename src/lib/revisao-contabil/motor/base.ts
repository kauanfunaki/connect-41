// Funções de base do motor: texto normalizado, dinheiro em centavos, meses e dias úteis.
// Portado de `dist/engine.py` (AudTool R_12 provisório, commit 92658a2). Cópia fiel: os testes-gabarito
// (`gabarito.test.ts`) comparam com o original chamada a chamada.

import { centavosDecimal, corta, d2, milhar, re, strip } from "./py";

export const VERSION = "R_12";
export const MONEY = String.raw`\(?-?\d[\d.]*,\d{2}\)?[DC]?`;

/** `str(v)` do Python, para os poucos lugares em que o motor converte valor em texto. */
export function pyStr(v: unknown): string {
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  return String(v);
}

/** Sem acento e em maiúsculas (NFKD sem as marcas combinantes). */
export function norm(s: unknown): string {
  return pyStr(s).normalize("NFKD").replace(/\p{Mn}/gu, "").toUpperCase();
}

/** Centavos de um valor "1.234,56", "(1,00)", "10,00C" ou "-5"; `null` quando não é número. */
export function number(s: unknown): number | null {
  if (typeof s === "number") return centavosDecimal(String(s)) ?? null;
  let t = strip(pyStr(s)).split("R$").join("").split(" ").join("");
  const negativo = t.endsWith("C") || t.startsWith("(") || t.startsWith("-");
  t = strip(t, "()DC+-");
  if (!t) return null;
  const v = centavosDecimal(t.split(".").join("").split(",").join("."));
  if (v === undefined) return null;
  return negativo ? -v : v;
}

/** `number()` de um texto que o padrão MONEY já validou: nunca é `null`. */
export function valor(s: string | null): number {
  const v = number(s);
  if (v === null) throw new TypeError(`valor não numérico: ${s}`);
  return v;
}

/** CNPJ (ou outro identificador) só com letras e dígitos. */
export function identifier(s: unknown): string {
  return norm(s).replace(/[^A-Z0-9]/g, "");
}

/** O cabeçalho de colunas define o layout do balancete; a coluna Classificação é opcional. */
export function trialHeader(clean: string): "classified" | "unclassified" | null {
  if (["SALDO ANTERIOR", "DEBITO", "CREDITO", "SALDO ATUAL"].every((x) => clean.includes(x))) {
    return clean.includes("CLASSIFICACAO") ? "classified" : "unclassified";
  }
  return null;
}

export const MONTHS_PT = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
export const MONTH_PT = MONTHS_PT.join("|");
export const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2025-03" → "mar/2025" */
export function monthLabel(m: string): string {
  const i = parseInt(m.slice(5, 7), 10) - 1;
  if (Number.isNaN(i)) throw new Error(`invalid literal for int() with base 10: '${m.slice(5, 7)}'`);
  const nome = MONTH_NAMES[i < 0 ? MONTH_NAMES.length + i : i];
  if (nome === undefined) throw new Error("list index out of range");
  return nome + "/" + m.slice(0, 4);
}

/** "2025-03-31" → "31/03/2025" */
export function dateBr(d: string): string {
  return d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4);
}

/** "R$ 1.234,56" (negativo com "-" antes). */
export function brl(v: number): string {
  const a = Math.abs(v);
  const n = Math.floor(a / 100);
  const c = a - n * 100;
  return (v < 0 ? "-" : "") + "R$ " + milhar(n).split(",").join(".") + "," + d2(c);
}

/** Valor com o lado: "R$ 10,00 D", "R$ 10,00 C" ou sem lado no zero. */
export function dc(v: number): string {
  return brl(Math.abs(v)) + (v > 0 ? " D" : v < 0 ? " C" : "");
}

/** Meses "AAAA-MM" de início a fim, inclusive. */
export function periodMonths(start: string, end: string): string[] {
  let y = parseInt(start.slice(0, 4), 10);
  let m = parseInt(start.slice(5, 7), 10);
  const ye = parseInt(end.slice(0, 4), 10);
  const me = parseInt(end.slice(5, 7), 10);
  const out: string[] = [];
  while (y < ye || (y === ye && m <= me)) {
    out.push(String(y).padStart(4, "0") + "-" + d2(m));
    if (m === 12) {
      y += 1;
      m = 1;
    } else m += 1;
  }
  return out;
}

/** Conta igual ao prefixo ou abaixo dele. */
export function under(code: string, p: string): boolean {
  return code === p || code.startsWith(p + ".");
}

export function inPrefix(a: { code: string }, p: string): boolean {
  return under(a.code, p);
}

// ─── Datas (o motor usa `date` do Python: dia, sem hora nem fuso) ──────────

const DIA_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dias desde 1970-01-01 de uma data ISO; lança como `date.fromisoformat` com data inválida. */
export function dias(iso: string): number {
  const m = ISO.exec(iso);
  const t = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : Number.NaN;
  const ok = m && +m[1] >= 1 && new Date(t).getUTCMonth() === +m[2] - 1 && new Date(t).getUTCDate() === +m[3];
  if (!ok) throw new Error(`Invalid isoformat string: '${iso}'`);
  // Date.UTC trata o ano 0-99 como 1900+: corrige.
  const d = new Date(0);
  d.setUTCFullYear(+m[1], +m[2] - 1, +m[3]);
  return Math.round(d.getTime() / DIA_MS);
}

/** Data ISO a partir de dias desde 1970-01-01. */
export function iso(n: number): string {
  const d = new Date(n * DIA_MS);
  return String(d.getUTCFullYear()).padStart(4, "0") + "-" + d2(d.getUTCMonth() + 1) + "-" + d2(d.getUTCDate());
}

export function somaDias(data: string, n: number): string {
  return iso(dias(data) + n);
}

/** Data ISO de ano, mês e dia (lança com data inválida, como `date(...)`). */
export function data(ano: number, mes: number, dia: number): string {
  const s = String(ano).padStart(4, "0") + "-" + d2(mes) + "-" + d2(dia);
  dias(s);
  return s;
}

/** Segunda = 0 ... domingo = 6, como `date.weekday()`. */
export function diaDaSemana(data: string): number {
  return (new Date(dias(data) * DIA_MS).getUTCDay() + 6) % 7;
}

/**
 * Feriados nacionais: Lei 662/1949 (redação da Lei 10.607/2002), Lei 6.802/1980 e Lei 14.759/2023
 * (20/11, desde 2024). Consulta em 28/10/2026.
 */
export const HOLIDAYS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"]);

export function holiday(d: string): boolean {
  const md = d.slice(5);
  return HOLIDAYS.has(md) || (md === "11-20" && parseInt(d.slice(0, 4), 10) >= 2024);
}

/** n-ésimo dia útil do mês "AAAA-MM": segunda a sexta, sem feriados nacionais (os locais não são conhecidos). */
export function businessDay(m: string, n: number): string {
  let d = data(parseInt(m.slice(0, 4), 10), parseInt(m.slice(5, 7), 10), 1);
  for (;;) {
    if (diaDaSemana(d) < 5 && !holiday(d)) {
      n -= 1;
      if (!n) return d;
    }
    d = somaDias(d, 1);
  }
}

export function nextMonth(m: string): string {
  const y = parseInt(m.slice(0, 4), 10);
  const mo = parseInt(m.slice(5, 7), 10);
  return mo === 12 ? String(y + 1).padStart(4, "0") + "-01" : String(y).padStart(4, "0") + "-" + d2(mo + 1);
}

/** Último dia do mês "AAAA-MM". */
export function monthEnd(m: string): string {
  return somaDias(nextMonth(m) + "-01", -1);
}

/** Fatia de texto em caracteres, como `str[:n]`. */
export { corta };

/** Padrão do motor compilado com a semântica do Python. */
export { re };
