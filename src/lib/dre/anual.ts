// A visão de doze meses — a `DRE Sumarizada` da planilha.
//
// ─── Por que as colunas de ano passam pelo mesmo motor ──────────────────────
//
// A tentação é somar as linhas: pegar a "margem de contribuição" de cada mês e
// somar as doze. Funciona para subtotal, e **não funciona para percentual** —
// média de razões não é razão de médias, e a planilha sabe disso: ela calcula
// o % do ano a partir dos valores já agregados (`N4/N3`), não da média dos
// percentuais mensais.
//
// Então a regra aqui é uma só: **agrega por grupo, depois monta as linhas**.
// Vale igual para mês, para soma e para média, e é o que garante que "margem
// de contribuição" signifique a mesma coisa nas quatorze colunas.
//
// ─── A média ignora mês sem movimento ───────────────────────────────────────
//
// `AVERAGE(B3:M3)` no Excel pula célula vazia. Em setembro, um DRE com nove
// meses fechados divide por nove, não por doze — e é o certo: dividir por doze
// em setembro diz que a empresa faturou 25% menos do que faturou.

import { montarLinhas, type ValorDaLinha } from "@/lib/dre/calculo";
import { GRUPOS, NAO_CLASSIFICADO, TRANSFERENCIA, OPCOES_PADRAO, type OpcoesDoDre } from "@/lib/dre/estrutura";

export type MesDoAno = {
  mes: number;
  /** Total por grupo naquele mês. */
  porGrupo: Record<string, number>;
  /** Houve movimento? Mês sem nada não entra na média. */
  temMovimento: boolean;
};

export type ColunaDoAno = {
  /** 1 a 12, ou `null` nas colunas de soma e média. */
  mes: number | null;
  rotulo: string;
  linhas: ValorDaLinha[];
};

export type DreAnual = {
  colunas: ColunaDoAno[];
  /** Quantos meses entraram na média. Zero quando o ano está vazio. */
  mesesComMovimento: number;
};

export const ROTULO_DO_MES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const TODOS_OS_GRUPOS = [...GRUPOS.map((g) => g.code), NAO_CLASSIFICADO, TRANSFERENCIA];

/**
 * Monta as quatorze colunas: doze meses, soma e média.
 *
 * Recebe os totais por grupo de cada mês — quem tem banco é quem os busca.
 */
export function dreDoAno(meses: MesDoAno[], opcoes: OpcoesDoDre = OPCOES_PADRAO): DreAnual {
  const porMes = new Map(meses.map((m) => [m.mes, m]));

  const colunas: ColunaDoAno[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const dados = porMes.get(mes);
    colunas.push({
      mes,
      rotulo: ROTULO_DO_MES[mes - 1]!,
      linhas: montarLinhas(dados?.porGrupo ?? {}, opcoes),
    });
  }

  const comMovimento = meses.filter((m) => m.temMovimento);

  const soma: Record<string, number> = {};
  for (const g of TODOS_OS_GRUPOS) {
    soma[g] = comMovimento.reduce((n, m) => n + (m.porGrupo[g] ?? 0), 0);
  }

  const media: Record<string, number> = {};
  for (const g of TODOS_OS_GRUPOS) {
    // Divisão inteira com arredondamento: a média é número de tela, e meio
    // centavo de resíduo por grupo não pode virar um total que não fecha.
    media[g] = comMovimento.length === 0 ? 0 : Math.round(soma[g]! / comMovimento.length);
  }

  colunas.push({ mes: null, rotulo: "Média", linhas: montarLinhas(media, opcoes) });
  colunas.push({ mes: null, rotulo: "Ano", linhas: montarLinhas(soma, opcoes) });

  return { colunas, mesesComMovimento: comMovimento.length };
}

/**
 * Os valores de uma linha ao longo das colunas.
 *
 * A tela desenha por linha, e não por coluna: o relatório é lido da esquerda
 * para a direita dentro de "Receita Bruta", não de cima para baixo dentro de
 * "Março".
 */
export function linhaAoLongoDoAno(anual: DreAnual, code: string): (ValorDaLinha | null)[] {
  return anual.colunas.map((c) => c.linhas.find((l) => l.code === code) ?? null);
}
