// Leitura do gabarito de `scripts/contabil-core/gabarito_sispag.py` para os testes do porte: cada
// registro é uma chamada do original, com a entrada e a saída (ou o erro) codificadas em JSON.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { texto, type Dec } from "../../motor/decimal";
import type { Celula } from "../../planilha/celula";

export type Json = null | boolean | number | string | Json[] | { [chave: string]: Json };

export type Registro = {
  fn: string;
  args: Json[];
  kwargs: Record<string, Json>;
  result?: Json;
  error?: { tipo: string; mensagem: string };
};

export const PASTA = __dirname;

export function registros(arquivo: string): Registro[] {
  return JSON.parse(readFileSync(join(PASTA, arquivo), "utf8")) as Registro[];
}

const objeto = (j: Json): Record<string, Json> | null => (j !== null && typeof j === "object" && !Array.isArray(j) ? j : null);

/** Os bytes do arquivo que a chamada recebeu (`{"$arquivo": nome}`). */
export function bytesDoArquivo(j: Json): Uint8Array {
  const nome = objeto(j)?.$arquivo;
  if (typeof nome !== "string") throw new Error(`não é arquivo: ${JSON.stringify(j)}`);
  return new Uint8Array(readFileSync(join(PASTA, nome)));
}

export const nomeDoArquivo = (j: Json) => String(objeto(j)?.$arquivo ?? "");

/** A célula como o Python a recebeu. */
export function celula(j: Json): Celula {
  if (j === null || typeof j === "string") return j;
  if (typeof j === "boolean") return { tipo: "bool", valor: j };
  if (typeof j === "number") return { tipo: "int", valor: BigInt(j) };
  const o = objeto(j);
  if (o) {
    if (typeof o.$int === "string") return { tipo: "int", valor: BigInt(o.$int) };
    if (typeof o.$f === "string") return { tipo: "float", valor: Number(o.$f) };
    if (typeof o.$dt === "string") return { tipo: "datahora", valor: o.$dt };
    if (typeof o.$date === "string") return { tipo: "datahora", valor: o.$date };
    if (typeof o.$time === "string") return { tipo: "hora", valor: o.$time };
    if (typeof o.$td === "string") return { tipo: "duracao", valor: o.$td };
  }
  throw new Error(`célula sem decodificação: ${JSON.stringify(j)}`);
}

export const decJson = (d: Dec | null): Json => (d === null ? null : { $dec: texto(d) });
export const dataJson = (iso: string | null): Json => (iso === null ? null : { $date: iso });

/** A saída do porte no formato do gabarito: `result` ou `error` com o nome da classe e a frase. */
export function executar(fn: () => Json): Pick<Registro, "result" | "error"> {
  try {
    return { result: fn() };
  } catch (e) {
    if (e instanceof Error) return { error: { tipo: e.name, mensagem: e.message } };
    throw e;
  }
}

export const esperado = (r: Registro): Pick<Registro, "result" | "error"> => (r.error ? { error: r.error } : { result: r.result ?? null });
