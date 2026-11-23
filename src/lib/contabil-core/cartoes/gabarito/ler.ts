// O gabarito dos leitores de fatura (scripts/contabil-core/gabarito_cartoes.py) para os testes: as chamadas
// gravadas do original e os arquivos que elas usam, com os valores do Python (`$dec`, `$dt`, `$f`...)
// trazidos para o lado do TypeScript.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reprFloat } from "../../planilha/celula";
import type { ValorPy } from "../../notas/visual";
import type { LancamentoLido } from "../leitor";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export type Registro = {
  fn: string;
  args: Json[];
  result?: Json;
  error?: { tipo: string; mensagem: string };
  chamadas_ia?: { [k: string]: Json }[];
  nome?: string;
};

const PASTA = join(__dirname);

const dados = JSON.parse(readFileSync(join(PASTA, "cartoes-chamadas.json"), "utf8")) as { ano_atual: number; chamadas: Registro[] };

/** O ano que o `datetime.now()` do original devolvia durante a gravação. */
export const ANO_ATUAL = dados.ano_atual;
export const relogio = () => new Date(Date.UTC(ANO_ATUAL, 10, 23, 12));

export function registros(fn: string): Registro[] {
  return dados.chamadas.filter((r) => r.fn === fn);
}

/** Os bytes do arquivo de `{"$arquivo": nome}`. */
export function arquivo(v: Json): Uint8Array {
  return new Uint8Array(readFileSync(join(PASTA, (v as { $arquivo: string }).$arquivo)));
}

/** O `LancamentoPDF` do Python (codificado) no formato do porte. */
export function lancamentoEsperado(v: Json): LancamentoLido {
  const r = v as Record<string, Json>;
  return {
    dataCompra: (r.data_compra as { $dt: string }).$dt.slice(0, 10),
    descricao: r.descricao as string,
    valor: (r.valor as { $dec: string }).$dec,
    parcelaAtual: r.parcela_atual as number | null,
    parcelaTotal: r.parcela_total as number | null,
  };
}

/**
 * O valor do `json.loads` do porte (`ValorPy`) na codificação do gabarito. `comFloat`: o número decimal é
 * `float` (o `json.loads` sem `parse_float`, da leitura por imagem); sem ele, `Decimal`.
 */
export function codificado(v: ValorPy, comFloat = false): Json {
  if (v === null || typeof v === "boolean" || typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((x) => codificado(x, comFloat));
  if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [k, codificado(x, comFloat)]));
  if (v.py === "int") {
    const n = BigInt(v.texto);
    return n > BigInt(2) ** BigInt(53) || n < -(BigInt(2) ** BigInt(53)) ? { $int: n.toString() } : Number(n) + 0;
  }
  if (v.py === "float") return { $f: v.texto };
  return comFloat ? { $f: reprFloat(Number(v.texto)) } : { $dec: v.texto };
}
