// Listas longas em blocos que recolhem (08/10/2026): Administração › Módulos,
// os módulos de um plano e as preferências de notificação. Os itens vêm
// agrupados (por setor, por aba), cada grupo num bloco que começa fechado com
// a contagem na linha ("6 de 9 ligados"), e a busca abre o grupo de quem casa.
// Aqui fica só a conta — filtrar, contar e marcar o grupo inteiro —, sem tela.

import { normalizar } from "@/lib/buscaDeTelas";

export type Grupo<T> = { chave: string; rotulo: string; itens: T[] };

/**
 * Os grupos com os itens que casam com o termo, na ordem recebida.
 *
 * Casa sem acento e em qualquer parte de um dos textos do item (`textos` diz
 * quais — o que a tela mostra dele). O nome do grupo também vale: "bpo" traz o
 * setor inteiro. Grupo sem item que case sai da lista. Termo vazio (ou só
 * espaço) devolve os grupos como vieram. O que mais o grupo carregar (a cor
 * do setor) vai junto.
 */
export function filtrarGrupos<G extends Grupo<unknown>>(
  grupos: G[],
  termo: string,
  textos: (item: G["itens"][number]) => string[]
): G[] {
  const alvo = normalizar(termo);
  if (!alvo) return grupos;

  const resultado: G[] = [];
  for (const g of grupos) {
    if (normalizar(g.rotulo).includes(alvo)) {
      resultado.push(g);
      continue;
    }
    const itens = g.itens.filter((item) => textos(item).some((t) => normalizar(t).includes(alvo)));
    if (itens.length > 0) resultado.push({ ...g, itens });
  }
  return resultado;
}

/**
 * Os grupos que ficam abertos depois de a pessoa digitar na busca: com termo,
 * os que têm resultado; sem termo, nenhum — a lista volta ao começo, tudo
 * fechado.
 */
export function gruposAbertosPelaBusca<G extends Grupo<unknown>>(
  grupos: G[],
  termo: string,
  textos: (item: G["itens"][number]) => string[]
): Set<string> {
  if (!normalizar(termo)) return new Set();
  return new Set(filtrarGrupos(grupos, termo, textos).map((g) => g.chave));
}

/** Quantos dos códigos estão no conjunto. */
export function quantosNoConjunto(conjunto: ReadonlySet<string>, codigos: readonly string[]): number {
  let n = 0;
  for (const c of codigos) if (conjunto.has(c)) n++;
  return n;
}

/**
 * Põe ou tira o grupo inteiro do conjunto, num conjunto novo (o de entrada não
 * muda — é estado do React). Os códigos de fora do grupo ficam como estavam.
 */
export function marcarGrupo(conjunto: ReadonlySet<string>, codigos: readonly string[], marcar: boolean): Set<string> {
  const novo = new Set(conjunto);
  for (const c of codigos) {
    if (marcar) novo.add(c);
    else novo.delete(c);
  }
  return novo;
}

/**
 * A contagem da linha do bloco: "6 de 9 ligados". A palavra concorda com o
 * total ("1 de 1 ligado", "0 de 3 ligados"), como no Valora; sem palavra, só
 * "6 de 9".
 */
export function contagemDoBloco(n: number, total: number, palavra?: { um: string; varios: string }): string {
  const base = `${n} de ${total}`;
  if (!palavra) return base;
  return `${base} ${total === 1 ? palavra.um : palavra.varios}`;
}
