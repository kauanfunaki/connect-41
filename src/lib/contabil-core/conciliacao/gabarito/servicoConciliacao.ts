// Leitura do gabarito do serviço da conciliação (`scripts/contabil-core/gabarito_servico_conciliacao.py`),
// usada por `servico.test.ts` e `planilhaDoRelatorio.test.ts`. Só para teste.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { dec } from "../../motor/decimal";
import type { RelatorioConciliacaoJson } from "../relatorio";
import type { EntradaConciliacao } from "../servico";

type EntradaJson = {
  empresa_cnpj: string | null;
  agencia: { banco_sigla: string; agencia: string; numero: string; tem_conta_contabil: boolean } | null;
  conta: { conta_numero: number | null; codigo: string; descricao: string } | null;
  razao: {
    empresa: string;
    cnpj: string;
    periodo_inicio: string | null;
    periodo_fim: string | null;
    conta_codigo: string;
    conta_classificacao: string;
    conta_descricao: string;
    lancamentos: [string, string, string, string, string][];
    total_debito: string;
    total_credito: string;
  };
  sispag: { conta: string; cnpj: string; pagamentos: [string, string, string, string, string, boolean][] } | null;
  transacoes: [string, string, number | null, string, string, string][];
};

export type CasoServico = {
  id: number;
  origem: "suite" | "dirigido" | "sorteado";
  entrada: EntradaJson;
  relatorio?: Record<string, unknown>;
  erro?: { tipo: string; mensagem: string };
};

export type CelulaDespejo = [string, "n" | "s" | "d" | "b" | null, string | number | boolean | null, string, boolean, string | null];
export type FolhaDespejo = {
  titulo: string;
  celulas: CelulaDespejo[];
  larguras: [number, number][];
  congelado: string | null;
  filtro: string | null;
};
export type CasoPlanilha = { id: number; folhas: FolhaDespejo[] };

function lerPartes<T>(prefixo: string): T[] {
  const nomes = readdirSync(__dirname)
    .filter((n) => n.startsWith(prefixo + "-") && n.endsWith(".json"))
    .sort((a, b) => Number(a.slice(prefixo.length + 1, -5)) - Number(b.slice(prefixo.length + 1, -5)));
  return nomes.flatMap((n) => JSON.parse(readFileSync(path.join(__dirname, n), "utf8")) as T[]);
}

export const casosServico = (): CasoServico[] => lerPartes<CasoServico>("servico-conciliacao");
export const casosPlanilha = (): CasoPlanilha[] => lerPartes<CasoPlanilha>("planilha-conciliacao");

export function entradaDoCaso(e: EntradaJson): EntradaConciliacao {
  const r = e.razao;
  return {
    empresaCnpj: e.empresa_cnpj,
    agencia: e.agencia && {
      bancoSigla: e.agencia.banco_sigla,
      agencia: e.agencia.agencia,
      numero: e.agencia.numero,
      temContaContabil: e.agencia.tem_conta_contabil,
    },
    contaContabil: e.conta && { contaNumero: e.conta.conta_numero, codigo: e.conta.codigo, descricao: e.conta.descricao },
    razao: {
      empresa: r.empresa,
      cnpj: r.cnpj,
      periodoInicio: r.periodo_inicio,
      periodoFim: r.periodo_fim,
      contaCodigo: r.conta_codigo,
      contaClassificacao: r.conta_classificacao,
      contaDescricao: r.conta_descricao,
      lancamentos: r.lancamentos.map(([data, lote, historico, contrapartida, valor]) => ({ data, lote, historico, contrapartida, valor: dec(valor) })),
      totalDebito: dec(r.total_debito),
      totalCredito: dec(r.total_credito),
    },
    sispag: e.sispag && {
      conta: e.sispag.conta,
      cnpj: e.sispag.cnpj,
      pagamentos: e.sispag.pagamentos.map(([data, valor, tipo, favorecido, documento, efetuado]) => ({ data, valor: dec(valor), tipo, favorecido, documento, efetuado })),
    },
    transacoes: e.transacoes.map(([id, data, ordem, valor, dc, historico]) => ({ id, data, ordem, valor: dec(valor), dc, historico })),
  };
}

const camel = (k: string) => k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase());

function chavesEmCamel(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(chavesEmCamel);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [camel(k), chavesEmCamel(x)]));
  }
  return v;
}

/** O relatório como o pydantic o serializou, na forma de `RelatorioConciliacaoJson`. */
export function relatorioDoGabarito(rel: Record<string, unknown>): RelatorioConciliacaoJson {
  const { conciliados_por_tipo: porTipo, ...resto } = rel;
  return {
    ...(chavesEmCamel(resto) as Omit<RelatorioConciliacaoJson, "conciliadosPorTipo">),
    // O `dict(Counter(...))` vira pares, na mesma ordem.
    conciliadosPorTipo: Object.entries(porTipo as Record<string, number>),
  };
}
