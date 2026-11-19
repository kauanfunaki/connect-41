// O gabarito dos leitores de notas (scripts/contabil-core/gabarito_notas.py) para os testes: as chamadas
// gravadas do original e os arquivos que elas usam, com os valores do Python (`$dec`, `$dt`, `$dict`...)
// trazidos para o lado do TypeScript.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { texto, type Dec } from "../../motor/decimal";
import type { NotaLida } from "../tipos";

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

const dados = JSON.parse(readFileSync(join(PASTA, "notas-chamadas.json"), "utf8")) as { gerado_em: string; chamadas: Registro[] };

/** O instante em que o gabarito foi gerado: o relógio da validade dos certificados. */
export const GERADO_EM = new Date(dados.gerado_em);

export function registros(fn: string): Registro[] {
  return dados.chamadas.filter((r) => r.fn === fn);
}

export function todasAsFuncoes(): string[] {
  return [...new Set(dados.chamadas.map((r) => r.fn))];
}

/** Os bytes do arquivo de `{"$arquivo": nome}`. */
export function arquivo(v: Json): Uint8Array {
  const nome = (v as { $arquivo: string }).$arquivo;
  return new Uint8Array(readFileSync(join(PASTA, nome)));
}

export function nomeDoArquivo(v: Json): string {
  return (v as { $arquivo: string }).$arquivo;
}

/** A nota do Python (`NotaParseada` codificada) como `NotaLida`, com o valor em texto. */
export function notaEsperada(v: Json): Omit<NotaLida, "valor"> & { valor: string } {
  const r = v as Record<string, Json>;
  const s = (x: Json) => (x === null ? null : (x as string));
  return {
    tipo: r.tipo as NotaLida["tipo"],
    numero: r.numero as string,
    serie: s(r.serie),
    cnpjEmitente: r.cnpj_emitente as string,
    nomeEmitente: s(r.nome_emitente),
    cnpjDestinatario: s(r.cnpj_destinatario),
    valor: (r.valor as { $dec: string }).$dec,
    dataEmissao: (r.data_emissao as { $dt: string }).$dt,
    chaveAcesso: s(r.chave_acesso),
    observacao: s(r.observacao),
    assinaturaNaoVerificada: s(r.assinatura_nao_verificada),
  };
}

/** A nota do porte no mesmo formato, para comparar. */
export function notaObtida(n: NotaLida): Omit<NotaLida, "valor"> & { valor: string } {
  return { ...n, valor: texto(n.valor as Dec) };
}
