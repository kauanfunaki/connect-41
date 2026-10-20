// A ordem dos campos customizados no construtor (escolha 5A dos Ajustes de
// 15/10, 20/10/2026): arrasta-se, ou move-se pelas setas, e a ordem nova é a
// posição de cada um. Era um número digitado na edição de cada campo.

/** A lista com o item de `de` levado para a posição `para`. Fora dos limites, a mesma lista. */
export function moverNaLista<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return [...lista];
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item!);
  return nova;
}

/**
 * A ordem pedida vale se tiver exatamente os campos do grupo (setor + ficha),
 * cada um uma vez: a tela pode estar velha (alguém criou ou excluiu um campo
 * noutra aba), e gravar meia ordem embaralharia o resto.
 */
export function ordemValida(pedida: readonly string[], doGrupo: readonly string[]): boolean {
  if (pedida.length !== doGrupo.length) return false;
  const unicos = new Set(pedida);
  if (unicos.size !== pedida.length) return false;
  return doGrupo.every((id) => unicos.has(id));
}
