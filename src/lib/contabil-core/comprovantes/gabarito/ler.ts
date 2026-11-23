// O gabarito do leitor de comprovantes (scripts/contabil-core/gabarito_comprovantes.py) para os testes:
// as chamadas gravadas do original e os arquivos que elas usam, com os valores do Python (`$dec`, `$dt`,
// `$dict`...) trazidos para o lado do TypeScript.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComprovanteLido } from "../leitor";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type Registro = {
  fn: string;
  args: Json[];
  kwargs: Json;
  result?: Json;
  error?: { tipo: string; mensagem: string };
  chamadas_ia?: { [k: string]: Json }[];
  nome?: string;
};

const PASTA = join(__dirname);

const dados = JSON.parse(readFileSync(join(PASTA, "comprovantes-chamadas.json"), "utf8")) as { gerado_em: string; chamadas: Registro[] };

export function registros(fn: string): Registro[] {
  return dados.chamadas.filter((r) => r.fn === fn);
}

/** Os bytes do arquivo de `{"$arquivo": nome}`. */
export function arquivo(v: Json): Uint8Array {
  return new Uint8Array(readFileSync(join(PASTA, (v as { $arquivo: string }).$arquivo)));
}

/** O `ComprovantePDF` do Python (codificado) no formato do porte. */
export function comprovanteEsperado(v: Json): ComprovanteLido {
  const r = v as Record<string, Json>;
  const dec = (x: Json) => (x === null ? null : (x as { $dec: string }).$dec);
  const dt = (x: Json) => (x === null ? null : (x as { $dt: string }).$dt);
  return {
    favorecido: r.favorecido as string | null,
    cpfCnpj: r.cpf_cnpj as string | null,
    dataPagamento: dt(r.data_pagamento),
    dataVencimento: dt(r.data_vencimento),
    valorDocumento: dec(r.valor_documento),
    valorPago: dec(r.valor_pago),
    juros: dec(r.juros),
    multa: dec(r.multa),
    desconto: dec(r.desconto),
    confianca: r.confianca as "regex" | "ia",
  };
}
