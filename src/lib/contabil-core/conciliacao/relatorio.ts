// O relatório da conciliação Razão × extrato (Bloco B, Fase B2, 12/11/2026): porte de
// `src/schemas/conciliacao_bancaria.py`. Nada disto é gravado: o relatório é calculado na hora, a
// partir do Razão enviado e do extrato já importado.
//
// Datas são texto "AAAA-MM-DD". No servidor, dinheiro é `Dec`; o que vai para o navegador é a versão
// `…Json`, com o dinheiro como texto ("-1234.50"), que a tela só formata e nunca soma.

import { dec, texto, type Dec } from "../motor/decimal";

export type CriterioComposicao = "SOMA_UNICA_POR_VALORES_SISPAG" | "SUGESTAO_POR_LOTES_E_SOMA";
export type ConfiancaComposicao = "CONFIRMADA" | "SUGERIDA";

export type LinhaRazaoDe<D> = { data: string; valor: D; historico: string; lote: string; contrapartida: string };
export type LinhaExtratoDe<D> = { transacaoId: string; data: string; valor: D; historico: string };
/** Pagamento da consulta do SISPAG: aqui, o que o banco pagou e o Razão não tem. */
export type LinhaSispagDe<D> = { data: string; valor: D; tipo: string; favorecido: string; documento: string };

/** Vínculo entre uma linha do extrato e pagamentos documentados pelo SISPAG. */
export type ComposicaoExtrato = {
  extratoIndice: number;
  razaoIndices: number[];
  sispagFaltandoIndices: number[];
  criterio: CriterioComposicao;
  confianca: ConfiancaComposicao;
};

export type GrupoConciliacaoDe<D> = {
  tipo: string;
  razao: LinhaRazaoDe<D>[];
  extrato: LinhaExtratoDe<D>[];
  diferenca: D;
  sispagFaltando: LinhaSispagDe<D>[];
  composicoes: ComposicaoExtrato[];
};

export type ResumoDiaDe<D> = {
  data: string;
  lancamentosRazao: number;
  lancamentosExtrato: number;
  movimentoRazao: D;
  movimentoExtrato: D;
  diferenca: D;
  pendencias: number;
  /** Casado com um lançamento de outro dia: deixa diferença no dia sem ser erro. */
  dataDiferente: number;
  aplicacaoSemExtrato: number;
};

export type ResumoConciliacaoDe<D> = {
  empresa: string;
  contaRazao: string;
  contaBancaria: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  lancamentosRazao: number;
  lancamentosExtrato: number;
  conciliados: number;
  pendencias: number;
  movimentoRazao: D;
  movimentoExtrato: D;
  diferenca: D;
  /** A soma das pendências explica a diferença inteira? Se não, o relatório não deve parecer completo. */
  diferencaExplicada: boolean;
  abertura: LinhaRazaoDe<D>[];
  /** Lançamentos de aplicação automática que o extrato não traz: não conferidos, fora das pendências. */
  aplicacaoSemExtrato: number;
};

export type RelatorioConciliacaoDe<D> = {
  resumo: ResumoConciliacaoDe<D>;
  avisos: string[];
  /** Tipo do grupo → quantos, na ordem em que o tipo apareceu pela primeira vez (o `Counter` do Python). */
  conciliadosPorTipo: [string, number][];
  pendencias: GrupoConciliacaoDe<D>[];
  aplicacaoSemExtrato: LinhaRazaoDe<D>[];
  porDia: ResumoDiaDe<D>[];
  sispagUsado: boolean;
};

export type RelatorioConciliacao = RelatorioConciliacaoDe<Dec>;
export type RelatorioConciliacaoJson = RelatorioConciliacaoDe<string>;
export type GrupoConciliacaoJson = GrupoConciliacaoDe<string>;
export type LinhaRazaoJson = LinhaRazaoDe<string>;
export type LinhaExtratoJson = LinhaExtratoDe<string>;
export type ResumoDiaJson = ResumoDiaDe<string>;

/** Rótulo de cada tipo de grupo (`exportar.py`), o mesmo na tela e na planilha. */
export const ROTULOS_DO_GRUPO: Record<string, string> = {
  CONCILIADO: "Conciliado",
  DATA_DIFERENTE: "Conciliado com data diferente",
  AGRUPADO: "Agrupado",
  LOTE_SISPAG: "Lote do SISPAG",
  LOTE_SISPAG_DIVERGENTE: "Lote do SISPAG com pagamento fora do razão",
  LOTE_DO_DIA: "Lote do dia (sobra do dia fecha)",
  DUPLICIDADE_RAZAO: "Possível duplicidade no razão",
  DUPLICIDADE_EXTRATO: "Possível duplicidade no extrato",
  VALOR_DIVERGENTE: "Valor divergente",
  SO_RAZAO: "Só no razão",
  SO_EXTRATO: "Só no extrato",
};

/** O mesmo relatório com o dinheiro trocado por `f` (o resto é copiado). */
function trocarDinheiro<A, B>(r: RelatorioConciliacaoDe<A>, f: (v: A) => B): RelatorioConciliacaoDe<B> {
  const linhaR = (l: LinhaRazaoDe<A>): LinhaRazaoDe<B> => ({ ...l, valor: f(l.valor) });
  return {
    resumo: {
      ...r.resumo,
      movimentoRazao: f(r.resumo.movimentoRazao),
      movimentoExtrato: f(r.resumo.movimentoExtrato),
      diferenca: f(r.resumo.diferenca),
      abertura: r.resumo.abertura.map(linhaR),
    },
    avisos: [...r.avisos],
    conciliadosPorTipo: r.conciliadosPorTipo.map(([tipo, n]): [string, number] => [tipo, n]),
    pendencias: r.pendencias.map((g) => ({
      tipo: g.tipo,
      razao: g.razao.map(linhaR),
      extrato: g.extrato.map((l) => ({ ...l, valor: f(l.valor) })),
      diferenca: f(g.diferenca),
      sispagFaltando: g.sispagFaltando.map((p) => ({ ...p, valor: f(p.valor) })),
      composicoes: g.composicoes.map((c) => ({ ...c, razaoIndices: [...c.razaoIndices], sispagFaltandoIndices: [...c.sispagFaltandoIndices] })),
    })),
    aplicacaoSemExtrato: r.aplicacaoSemExtrato.map(linhaR),
    porDia: r.porDia.map((d) => ({
      ...d,
      movimentoRazao: f(d.movimentoRazao),
      movimentoExtrato: f(d.movimentoExtrato),
      diferenca: f(d.diferenca),
    })),
    sispagUsado: r.sispagUsado,
  };
}

/**
 * O relatório para o navegador: o dinheiro vira o texto exato do `Decimal`, como o pydantic o
 * serializa (`str(d)`: "1200.00", "-0.00", "1E+2").
 */
export function relatorioParaJson(r: RelatorioConciliacao): RelatorioConciliacaoJson {
  return trocarDinheiro(r, texto);
}

/** O caminho de volta: o relatório que veio como JSON, com o dinheiro de novo em `Dec`. */
export function relatorioDoJson(r: RelatorioConciliacaoJson): RelatorioConciliacao {
  return trocarDinheiro(r, dec);
}
