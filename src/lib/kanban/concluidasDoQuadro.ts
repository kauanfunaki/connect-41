// Quantas concluídas o quadro de uma lista carrega (10/11/2026). Puro, sem
// banco: a página lê o `?concluidas=N` daqui, e o quadro e a Lista (componentes
// de cliente) montam o "Ver mais concluídas" com o mesmo passo.

/** De cada coluna concluída, o quadro abre com as 50 mais recentes. */
export const CONCLUIDAS_POR_PASSO = 50;

/**
 * O teto do `?concluidas=N`. Quem precisa ir além de 1.000 concluídas numa
 * coluna procura pela atividade, não rola o quadro — e o teto impede que um
 * endereço digitado à mão traga a lista inteira de volta.
 */
export const CONCLUIDAS_NO_MAXIMO = 1000;

/** A coluna concluída: quantas há no banco e quantas vieram para a tela. */
export type ResumoDaConcluida = { total: number; mostradas: number };

/** O `?concluidas=N` da URL, arredondado ao passo e dentro do teto. */
export function lerLimiteDeConcluidas(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  const n = Number.parseInt(texto ?? "", 10);
  if (!Number.isFinite(n) || n <= CONCLUIDAS_POR_PASSO) return CONCLUIDAS_POR_PASSO;
  const arredondado = Math.ceil(n / CONCLUIDAS_POR_PASSO) * CONCLUIDAS_POR_PASSO;
  return Math.min(arredondado, CONCLUIDAS_NO_MAXIMO);
}

/** O próximo passo do "Ver mais", ou `null` quando já está no teto. */
export function proximoLimite(atual: number): number | null {
  return atual >= CONCLUIDAS_NO_MAXIMO ? null : Math.min(atual + CONCLUIDAS_POR_PASSO, CONCLUIDAS_NO_MAXIMO);
}

/** A coluna tem concluídas mais antigas fora da tela. */
export function temMaisConcluidas(resumo: ResumoDaConcluida | undefined): boolean {
  return !!resumo && resumo.total > resumo.mostradas;
}
