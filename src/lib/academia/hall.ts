// O Hall dos campeões (Academia, Fase 2, 11/11/2026 — Controle interno
// funcionalidade-594): quando o mês acaba, o pódio de cada teste (o ranking
// geral, todos os níveis) e a maior evolução da equipe ficam gravados, com o
// prêmio do mês. Gravar (e não recalcular) deixa o Hall igual ao que valeu no
// dia: quem saiu da equipe depois, o texto que o administrador mudou, a
// importação do Hub — nada mexe no que já foi entregue. Puro.

import { PODIO, resultadoEmTexto, type PosicaoNoRanking } from "./ranking";
import { evolucaoEmTexto, numeroDoMesEmTexto, type LinhaDaEvolucao } from "./evolucao";
import { ROTULO_CURTO_DO_TESTE, TESTES, type Teste } from "./regras";

/** A categoria do Hall: um teste (o pódio) ou "evolucao" (a maior evolução do mês). */
export const CATEGORIA_DA_EVOLUCAO = "evolucao";
export type CategoriaDoHall = Teste | typeof CATEGORIA_DA_EVOLUCAO;
export const CATEGORIAS_DO_HALL: readonly CategoriaDoHall[] = [...TESTES, CATEGORIA_DA_EVOLUCAO];
export const ehCategoriaDoHall = (v: unknown): v is CategoriaDoHall => typeof v === "string" && (CATEGORIAS_DO_HALL as readonly string[]).includes(v);
export const ROTULO_DA_CATEGORIA: Record<CategoriaDoHall, string> = { ...ROTULO_CURTO_DO_TESTE, evolucao: "Maior evolução" };

/** Quantos meses encerrados o Hall mostra (e fecha, se ainda não fechou). */
export const MESES_DO_HALL = 12;

export type CampeaoParaGravar = { categoria: CategoriaDoHall; posicao: number; userId: string; teste: Teste; valor: string };

/**
 * Os campeões de um mês: o pódio de cada teste e a maior evolução — entre os
 * primeiros da evolução de cada teste, o de maior percentual (empate, o teste
 * na ordem de `TESTES`).
 */
export function campeoesDoMes(
  rankings: Readonly<Record<Teste, readonly PosicaoNoRanking[]>>,
  evolucoes: Readonly<Record<Teste, readonly LinhaDaEvolucao[]>>,
): CampeaoParaGravar[] {
  const lista: CampeaoParaGravar[] = [];
  for (const teste of TESTES) {
    for (const p of rankings[teste].slice(0, PODIO)) {
      lista.push({ categoria: teste, posicao: p.posicao, userId: p.userId, teste, valor: resultadoEmTexto(teste, p) });
    }
  }
  let maior: { teste: Teste; l: LinhaDaEvolucao } | null = null;
  for (const teste of TESTES) {
    const l = evolucoes[teste][0];
    if (l && (!maior || l.evolucao > maior.l.evolucao)) maior = { teste, l };
  }
  if (maior) {
    const { teste, l } = maior;
    lista.push({
      categoria: CATEGORIA_DA_EVOLUCAO, posicao: 1, userId: l.userId, teste,
      valor: `${evolucaoEmTexto(l.evolucao)} em ${ROTULO_CURTO_DO_TESTE[teste]} (${numeroDoMesEmTexto(teste, l.atual)})`,
    });
  }
  return lista;
}
