// A conciliação Razão × extrato na tela (Bloco B, Fase B2, 12/11/2026): o que o `RazaoExtratoTab.tsx`
// do Contábil Core fazia com o relatório antes de desenhar, sem a revisão manual (fase B3). Puro: as
// somas rodam no servidor (a rota manda o resultado junto com o relatório), e o navegador só filtra,
// agrupa e formata — o dinheiro chega como texto e a tela nunca soma.
//
// O original somava com `Number()` no navegador (o total de cada lado do lote e o "razão vinculado" de
// cada linha do extrato). Aqui essas contas são decimais exatas, feitas uma vez na rota.

import { dec, ehZero, modulo, somaTodos, subtrai, texto, type Dec } from "../motor/decimal";
import { reais } from "../motor/valorConfiavel";
import { ROTULOS_DO_GRUPO, type GrupoConciliacaoJson, type RelatorioConciliacaoJson, type ResumoDiaJson } from "./relatorio";

// ─── Somas (servidor) ───────────────────────────────────────────────────────

/**
 * Como uma linha do extrato de um grupo se compõe com o Razão.
 * - `grupo_unico`: uma linha só no extrato, então todo o Razão do grupo é dela;
 * - `soma_unica_sispag`: os valores do SISPAG só fecham de um jeito (confirmada);
 * - `lotes_soma`: sugestão pela soma e pelos lotes do Domínio — conferir antes de usar;
 * - `sem_vinculo`: o relatório não trouxe vínculo seguro (ou trouxe índice fora do grupo).
 */
export type CriterioNaTela = "grupo_unico" | "soma_unica_sispag" | "lotes_soma" | "sem_vinculo";

export type ComposicaoNaTela = {
  extratoIndice: number;
  razaoIndices: number[];
  sispagFaltandoIndices: number[];
  criterio: CriterioNaTela;
  sugerida: boolean;
  /** Soma do Razão vinculado; `null` quando não há vínculo seguro. */
  totalRazao: string | null;
  /** Razão vinculado − linha do extrato; `null` quando não há vínculo seguro. */
  diferenca: string | null;
};

export type SomasDoGrupo = { totalExtrato: string; totalRazao: string; composicoes: ComposicaoNaTela[] };

const somar = (linhas: { valor: string }[]): Dec => somaTodos(linhas.map((l) => dec(l.valor)));
const dentro = (indices: number[], tamanho: number) => indices.filter((i) => Number.isInteger(i) && i >= 0 && i < tamanho);

/** As composições de cada linha do extrato de um grupo (`montarComposicoes` do original). */
export function composicoesDoGrupo(g: GrupoConciliacaoJson): ComposicaoNaTela[] {
  if (g.extrato.length === 0) return [];
  if (g.extrato.length === 1) {
    const total = somar(g.razao);
    return [
      {
        extratoIndice: 0,
        razaoIndices: g.razao.map((_, i) => i),
        sispagFaltandoIndices: g.sispagFaltando.map((_, i) => i),
        criterio: "grupo_unico",
        sugerida: false,
        totalRazao: texto(total),
        diferenca: texto(subtrai(total, dec(g.extrato[0].valor))),
      },
    ];
  }
  const recebidas = new Map(g.composicoes.map((c) => [c.extratoIndice, c]));
  return g.extrato.map((linha, extratoIndice) => {
    const c = recebidas.get(extratoIndice);
    const razaoIndices = c ? dentro(c.razaoIndices, g.razao.length) : [];
    const sispagFaltandoIndices = c ? dentro(c.sispagFaltandoIndices, g.sispagFaltando.length) : [];
    // Índice fora do grupo é dado quebrado: melhor não vincular nada do que mostrar conferência falsa.
    if (!c || razaoIndices.length !== c.razaoIndices.length || sispagFaltandoIndices.length !== c.sispagFaltandoIndices.length) {
      return { extratoIndice, razaoIndices: [], sispagFaltandoIndices: [], criterio: "sem_vinculo", sugerida: false, totalRazao: null, diferenca: null };
    }
    const total = somaTodos(razaoIndices.map((i) => dec(g.razao[i].valor)));
    return {
      extratoIndice,
      razaoIndices,
      sispagFaltandoIndices,
      criterio: c.criterio === "SUGESTAO_POR_LOTES_E_SOMA" ? "lotes_soma" : "soma_unica_sispag",
      sugerida: c.confianca === "SUGERIDA",
      totalRazao: texto(total),
      diferenca: texto(subtrai(total, dec(linha.valor))),
    };
  });
}

/** As somas de cada grupo de pendência, na mesma ordem de `relatorio.pendencias`. Roda na rota. */
export function somasDaTela(r: RelatorioConciliacaoJson): SomasDoGrupo[] {
  return r.pendencias.map((g) => ({
    totalExtrato: texto(somar(g.extrato)),
    totalRazao: texto(somar(g.razao)),
    composicoes: composicoesDoGrupo(g),
  }));
}

// ─── Filtros e agrupamento (navegador) ──────────────────────────────────────

/** "R$ -0,50": o `reais` do motor copia o Python e perde o sinal de "-0,50"; aqui o sinal fica. */
export function moedaDoRelatorio(valor: string): string {
  const d = dec(valor);
  const t = reais(modulo(d));
  return d.negativo && !ehZero(d) ? t.replace("R$ ", "R$ -") : t;
}

export function valorZerado(valor: string): boolean {
  return ehZero(dec(valor));
}

/** "2026-09-01" → "01/09/2026" (data de calendário, sem fuso). */
export function dataBr(data: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

export const rotuloDoGrupo = (tipo: string) => ROTULOS_DO_GRUPO[tipo] ?? tipo;

/**
 * Lote: muitos lançamentos de um lado, ou pagamento do SISPAG faltando. Não cabe em colunas — 23
 * lançamentos empilhados escondiam o que importa (o pagamento sem par); a tela mostra o resumo e
 * recolhe a composição.
 */
export function ehLote(g: GrupoConciliacaoJson): boolean {
  return g.razao.length + g.extrato.length > 3 || g.sispagFaltando.length > 0;
}

/** Um grupo de pendência com a posição dele no relatório (a chave das somas). */
export type PendenciaNaTela = { indice: number; grupo: GrupoConciliacaoJson };
export type TipoDePendencia = { tipo: string; rotulo: string; pendencias: PendenciaNaTela[] };

/** As pendências que tocam o dia escolhido (por qualquer linha do Razão ou do extrato); sem dia, todas. */
export function pendenciasDoDia(pendencias: GrupoConciliacaoJson[], dia: string | null): PendenciaNaTela[] {
  return pendencias
    .map((grupo, indice) => ({ indice, grupo }))
    .filter(({ grupo }) => !dia || grupo.razao.some((l) => l.data === dia) || grupo.extrato.some((l) => l.data === dia));
}

/** Agrupa por tipo, na ordem em que cada tipo aparece no relatório (a do original). */
export function agruparPorTipo(pendencias: PendenciaNaTela[]): TipoDePendencia[] {
  const porTipo = new Map<string, TipoDePendencia>();
  for (const p of pendencias) {
    const t = porTipo.get(p.grupo.tipo) ?? { tipo: p.grupo.tipo, rotulo: rotuloDoGrupo(p.grupo.tipo), pendencias: [] };
    t.pendencias.push(p);
    porTipo.set(p.grupo.tipo, t);
  }
  return [...porTipo.values()];
}

/** Os dias da tabela "Por dia"; com o filtro, só os que têm diferença ou pendência. */
export function diasDaTela(porDia: ResumoDiaJson[], soComDiferenca: boolean): ResumoDiaJson[] {
  return soComDiferenca ? porDia.filter((d) => !valorZerado(d.diferenca) || d.pendencias > 0) : porDia;
}

/** "1 lançamento", "3 lançamentos". */
export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
