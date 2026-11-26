// O gabarito do leitor do Razão de fornecedores (scripts/contabil-core/gabarito_concilpro.py) para os testes:
// as chamadas gravadas do original e os arquivos que elas usam, com os valores do Python (`$dec`, `$dt`, `$f`,
// `$tupla`...) trazidos para o lado do TypeScript, e o caminho de volta (o resultado do porte na codificação do
// gabarito, com as chaves do original).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dec, texto as textoDec, type Dec } from "../../motor/decimal";
import type { ValorPy } from "../../notas/visual";
import { codificado } from "../../cartoes/gabarito/ler";
import type { ColunasDoCabecalho, FornecedorDoRazao, LancamentoDoRazao, RazaoDeFornecedores } from "../leitor";

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type Objeto = { [k: string]: Json };

/** Uma chamada à IA simulada, como o original a fez. */
export type ChamadaIa = {
  tipo: "texto" | "visao" | "classificacao";
  modelo: string;
  sistema: "PARSE" | "VISION" | "CLASSIFY";
  texto: string | null;
  imagens: number;
  paginas?: number[];
  max_tokens: number;
  timeout: number | null;
};

/** Uma regra da IA simulada: o tipo da chamada, o trecho do texto e a resposta (ou a falha). */
export type Regra = { tipo: string | null; se: string | null; content: string; uma_vez?: boolean; falha?: boolean };

export type Registro = {
  fn: string;
  nome?: string;
  args: Json[];
  result?: Json;
  processado?: Json;
  error?: { tipo: string; mensagem: string };
  chamadas_ia?: ChamadaIa[];
  config?: { chave: boolean; respostas: Regra[] };
  sem_ia?: { result?: Json; processado?: Json; error?: { tipo: string; mensagem: string } };
  suite?: boolean;
};

const PASTA = join(__dirname);
const dados = JSON.parse(readFileSync(join(PASTA, "concilpro-chamadas.json"), "utf8")) as {
  prompts: Record<"PARSE" | "VISION" | "CLASSIFY", string>;
  chamadas: Registro[];
};

export const PROMPTS = dados.prompts;

export function registros(fn: string): Registro[] {
  return dados.chamadas.filter((r) => r.fn === fn);
}

export const todos = (): Registro[] => dados.chamadas;

/** Os bytes do arquivo de `{"$arquivo": nome}`. */
export function arquivo(v: Json): Uint8Array {
  return new Uint8Array(readFileSync(join(PASTA, (v as { $arquivo: string }).$arquivo)));
}

// ─── Do Python para o porte ─────────────────────────────────────────────────

/** Um `float` do Python (`{"$f": repr}`) ou um número. */
export const numero = (j: Json): number => (typeof j === "number" ? j : Number((j as { $f: string }).$f));

/** Um `Decimal` (ou `int`) do Python. */
export const decimalDe = (j: Json): Dec => (typeof j === "number" ? dec(String(j)) : dec((j as { $dec: string }).$dec));

/** Um `datetime` do Python ("AAAA-MM-DDTHH:MM:SS") no texto do porte ("AAAA-MM-DD HH:MM:SS"). */
export const dataDe = (j: Json): string => (j as { $dt: string }).$dt.replace("T", " ");

/** O valor do `json.loads(..., parse_float=Decimal)` codificado de volta para `ValorPy`. */
export function valorPyDe(j: Json): ValorPy {
  if (j === null || typeof j === "boolean" || typeof j === "string") return j;
  if (typeof j === "number") return { py: "int", texto: String(j) };
  if (Array.isArray(j)) return j.map(valorPyDe);
  if ("$dec" in j) return { py: "dec", valor: dec(j.$dec as string), texto: j.$dec as string };
  if ("$int" in j) return { py: "int", texto: j.$int as string };
  if ("$f" in j) return { py: "float", texto: j.$f as "nan" | "inf" | "-inf" };
  return new Map(Object.entries(j).map(([k, v]) => [k, valorPyDe(v)]));
}

/** O lançamento do original (com as chaves que tiver) no formato do porte; o que falta vem com o padrão do `.get`. */
export function lancamentoDe(j: Json): LancamentoDoRazao {
  const o = j as Objeto;
  const l: LancamentoDoRazao = {
    dataLancamento: o.data_lancamento ? dataDe(o.data_lancamento) : "",
    lote: (o.lote as string) ?? "",
    historico: (o.historico as string) ?? "",
    contaPartida: (o.conta_partida as string) ?? null,
    valorDebito: o.valor_debito === undefined ? dec("0") : decimalDe(o.valor_debito),
    valorCredito: o.valor_credito === undefined ? dec("0") : decimalDe(o.valor_credito),
    saldoAposLancamento: o.saldo_apos_lancamento === undefined ? dec("0") : decimalDe(o.saldo_apos_lancamento),
    saldoTipo: (o.saldo_tipo as string) ?? "",
    tipoOperacao: (o.tipo_operacao as string) ?? "",
    numeroNf: (o.numero_nf as string) ?? null,
    cnpjHistorico: (o.cnpj_historico as string) ?? null,
    classificacaoIncerta: (o.classificacao_incerta as boolean) ?? false,
    classificadoPorIa: (o.classificado_por_ia as boolean) ?? false,
  };
  if (o.consolidado !== undefined) l.consolidado = true;
  if (o.lancamentos_originais !== undefined) l.lancamentosOriginais = o.lancamentos_originais as number;
  if (o.serie_nf !== undefined) l.serieNf = o.serie_nf as string | null;
  if (o.serie !== undefined) l.serie = o.serie as string | null;
  return l;
}

export function fornecedorDe(j: Json): FornecedorDoRazao {
  const o = j as Objeto;
  return {
    codigoConta: (o.codigo_conta as string) ?? "",
    contaContabil: (o.conta_contabil as string) ?? "",
    nomeFornecedor: (o.nome_fornecedor as string) ?? "",
    saldoAnterior: o.saldo_anterior === undefined ? dec("0") : decimalDe(o.saldo_anterior),
    saldoAnteriorTipo: (o.saldo_anterior_tipo as string) ?? "",
    totalDebito: o.total_debito === undefined ? dec("0") : decimalDe(o.total_debito),
    totalCredito: o.total_credito === undefined ? dec("0") : decimalDe(o.total_credito),
    lancamentos: ((o.lancamentos as Json[]) ?? []).map(lancamentoDe),
    conciliacaoIa: o.conciliacao_ia === undefined ? [] : valorPyDe(o.conciliacao_ia),
    resumoIa: o.resumo_ia === undefined ? new Map() : valorPyDe(o.resumo_ia),
    validacaoIa: o.validacao_ia === undefined ? new Map() : valorPyDe(o.validacao_ia),
  };
}

export function razaoDe(j: Json): RazaoDeFornecedores {
  const o = j as Objeto;
  return {
    hashArquivo: o.hash_arquivo as string,
    empresa: o.empresa as string,
    cnpj: o.cnpj as string,
    periodoInicio: o.periodo_inicio ? dataDe(o.periodo_inicio) : null,
    periodoFim: o.periodo_fim ? dataDe(o.periodo_fim) : null,
    totalFornecedores: o.total_fornecedores as number,
    totalLancamentos: o.total_lancamentos as number,
    fornecedores: (o.fornecedores as Json[]).map(fornecedorDe),
  };
}

/** As colunas do cabeçalho do original (`valores` é um dict com a ordem do cabeçalho). */
export function colunasDe(j: Json): ColunasDoCabecalho {
  const o = j as Objeto;
  return {
    valores: new Map(Object.entries(o.valores as Objeto).map(([k, v]) => [k, v as number])),
    tolerancia: o.tolerancia as number,
    historico: o.historico as number | null,
    cta: o.cta as number | null,
    inicioDebito: o.inicio_debito as number,
  };
}

// ─── Do porte para o Python ─────────────────────────────────────────────────

export const decimalPy = (d: Dec): Json => ({ $dec: textoDec(d) });
const dataPy = (t: string): Json => ({ $dt: t.replace(" ", "T") });

export function lancamentoPy(l: LancamentoDoRazao): Objeto {
  const o: Objeto = {
    data_lancamento: dataPy(l.dataLancamento),
    lote: l.lote,
    historico: l.historico,
    conta_partida: l.contaPartida,
    valor_debito: decimalPy(l.valorDebito),
    valor_credito: decimalPy(l.valorCredito),
    saldo_apos_lancamento: decimalPy(l.saldoAposLancamento),
    saldo_tipo: l.saldoTipo,
    tipo_operacao: l.tipoOperacao,
    numero_nf: l.numeroNf,
    cnpj_historico: l.cnpjHistorico,
    classificacao_incerta: l.classificacaoIncerta,
    classificado_por_ia: l.classificadoPorIa,
  };
  if (l.consolidado) o.consolidado = true;
  if (l.lancamentosOriginais !== undefined) o.lancamentos_originais = l.lancamentosOriginais;
  if (l.serieNf !== undefined) o.serie_nf = l.serieNf;
  if (l.serie !== undefined) o.serie = l.serie;
  return o;
}

export function fornecedorPy(f: FornecedorDoRazao): Objeto {
  return {
    codigo_conta: f.codigoConta,
    conta_contabil: f.contaContabil,
    nome_fornecedor: f.nomeFornecedor,
    saldo_anterior: decimalPy(f.saldoAnterior),
    saldo_anterior_tipo: f.saldoAnteriorTipo,
    total_debito: decimalPy(f.totalDebito),
    total_credito: decimalPy(f.totalCredito),
    lancamentos: f.lancamentos.map(lancamentoPy),
    conciliacao_ia: codificado(f.conciliacaoIa) as Json,
    resumo_ia: codificado(f.resumoIa) as Json,
    validacao_ia: codificado(f.validacaoIa) as Json,
  };
}

export function razaoPy(r: RazaoDeFornecedores): Objeto {
  return {
    hash_arquivo: r.hashArquivo,
    empresa: r.empresa,
    cnpj: r.cnpj,
    periodo_inicio: r.periodoInicio === null ? null : dataPy(r.periodoInicio),
    periodo_fim: r.periodoFim === null ? null : dataPy(r.periodoFim),
    total_fornecedores: r.totalFornecedores,
    total_lancamentos: r.totalLancamentos,
    fornecedores: r.fornecedores.map(fornecedorPy),
  };
}

/** O que o porte produziu, só com as chaves que o original tinha (as entradas da suíte trazem dicts incompletos). */
export function projetar(obtido: Json, esperado: Json): Json {
  if (Array.isArray(esperado) && Array.isArray(obtido)) return obtido.map((x, i) => (i < esperado.length ? projetar(x, esperado[i]) : x));
  if (esperado && typeof esperado === "object" && !Array.isArray(esperado) && obtido && typeof obtido === "object" && !Array.isArray(obtido)) {
    const marcado = Object.keys(esperado).some((k) => k.startsWith("$"));
    if (marcado) return obtido;
    // A chave que falta no porte fica `undefined` (e não bate com o `null` do original).
    return Object.fromEntries(Object.keys(esperado).map((k) => [k, projetar(obtido[k] as Json, esperado[k])]));
  }
  return obtido;
}

/** O `int` 0 que o `sum()` sem parcelas devolve nos totais vira o `Decimal` "0" do porte. */
export function totaisComoDecimal(j: Json): Json {
  if (Array.isArray(j)) return j.map(totaisComoDecimal);
  if (j && typeof j === "object") {
    if (Object.keys(j).some((k) => k.startsWith("$"))) return j;
    return Object.fromEntries(
      Object.entries(j).map(([k, v]) => [k, (k === "total_debito" || k === "total_credito") && typeof v === "number" ? { $dec: String(v) } : totaisComoDecimal(v)]),
    );
  }
  return j;
}
