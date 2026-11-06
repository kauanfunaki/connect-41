// Subatividade dentro de subatividade (06/11/2026, como no ClickUp: "Planilha ›
// Abril › Dia 01 › Manhã"). Até aqui a atividade tinha subatividades de um
// nível só: a `criarSubtarefa` recusava pai que já fosse subatividade, e o
// detalhe escondia a seção. A guarda era só da action — a coluna
// `parentItemId` e a chave com cascata do banco sempre aceitaram a árvore.
//
// Puro, sem banco: a lista e o detalhe (componentes de cliente) importam daqui.

/**
 * Quantos níveis de subatividade cabem abaixo da atividade. A atividade é o
 * nível 0; a subatividade dela, o 1; a do 5º nível já não recebe filhas.
 *
 * Por que 5: o exemplo do ClickUp que pediu a mudança usa 3 (mês › dia ›
 * turno), e sobram 2. Mais fundo que isso, o recuo de cada nível (20 px na
 * tabela, 14 px no cartão do celular) come o nome da atividade, e a árvore
 * deixa de ser lida de relance — dividir mais cabe no Checklist da
 * subatividade. E o MySQL para a exclusão em cascata depois de 15 níveis
 * encadeados: o teto fica bem longe dele.
 */
export const PROFUNDIDADE_MAXIMA = 5;

/** Um item nesta profundidade (0 = a atividade) ainda recebe subatividade. */
export function aceitaSubatividade(profundidade: number): boolean {
  return profundidade < PROFUNDIDADE_MAXIMA;
}

/** O aviso de quem tenta passar do limite. */
export const AVISO_DO_LIMITE = `Este já é o ${PROFUNDIDADE_MAXIMA}º nível de subatividade, o limite. Para dividir mais, use o Checklist desta subatividade.`;

export type ItemDaArvore = {
  id: string;
  parentItemId: string | null;
  order: number;
  createdAt: Date | string;
};

export type NoDaArvore<T> = T & { filhas: NoDaArvore<T>[] };

function instante(d: Date | string): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}

/** A ordem de irmãs: a manual (`order`), e a de criação no empate. */
export function porOrdem(a: Pick<ItemDaArvore, "order" | "createdAt">, b: Pick<ItemDaArvore, "order" | "createdAt">): number {
  return a.order - b.order || instante(a.createdAt) - instante(b.createdAt);
}

/**
 * A árvore a partir da lista plana dos itens de uma lista. Raiz é o item sem
 * pai; o item cujo pai não está na lista fica de fora (não vira raiz solta).
 * Irmãs saem na ordem de `porOrdem`.
 */
export function montarArvore<T extends ItemDaArvore>(itens: readonly T[]): NoDaArvore<T>[] {
  const nos = new Map<string, NoDaArvore<T>>();
  for (const item of itens) nos.set(item.id, { ...item, filhas: [] });
  const raizes: NoDaArvore<T>[] = [];
  for (const no of nos.values()) {
    if (no.parentItemId === null) raizes.push(no);
    else nos.get(no.parentItemId)?.filhas.push(no);
  }
  const ordenar = (lista: NoDaArvore<T>[]) => {
    lista.sort(porOrdem);
    for (const no of lista) ordenar(no.filhas);
  };
  ordenar(raizes);
  return raizes;
}

/** Todas as subatividades abaixo do nó, em qualquer nível (o nó fica de fora). */
export function descendentes<T>(no: NoDaArvore<T>): NoDaArvore<T>[] {
  const out: NoDaArvore<T>[] = [];
  const pilha = [...no.filhas].reverse();
  while (pilha.length > 0) {
    const atual = pilha.pop()!;
    out.push(atual);
    for (let i = atual.filhas.length - 1; i >= 0; i--) pilha.push(atual.filhas[i]);
  }
  return out;
}

/**
 * O "0/1" de cada nível: as filhas diretas concluídas sobre o total delas.
 * Neta não conta no pai — cada nível mostra o seu, como no ClickUp, e a
 * subatividade aberta com netas concluídas não infla o progresso de cima.
 */
export function contarFilhas<T>(no: NoDaArvore<T>, concluida: (item: T) => boolean): { concluidas: number; total: number } {
  return { concluidas: no.filhas.filter(concluida).length, total: no.filhas.length };
}

/**
 * Os pais de um item, do de cima até o imediato. Para no primeiro pai que não
 * está no índice e não entra em laço (dado montado à mão no banco).
 */
export function ancestrais<T extends Pick<ItemDaArvore, "id" | "parentItemId">>(porId: ReadonlyMap<string, T>, id: string): T[] {
  const out: T[] = [];
  const vistos = new Set<string>([id]);
  let pai = porId.get(id)?.parentItemId ?? null;
  while (pai !== null && !vistos.has(pai)) {
    const item = porId.get(pai);
    if (!item) break;
    out.unshift(item);
    vistos.add(pai);
    pai = item.parentItemId;
  }
  return out;
}

/**
 * A ordem nova das irmãs quando `origem` é solta em cima de `alvo`: ela vai
 * para o lugar do alvo, e as do meio andam uma casa. Sem mudança (alvo igual à
 * origem, ou um dos dois fora da lista), devolve `null`.
 */
export function reposicionar(ids: readonly string[], origem: string, alvo: string): string[] | null {
  const de = ids.indexOf(origem);
  const para = ids.indexOf(alvo);
  if (de === -1 || para === -1 || de === para) return null;
  const nova = ids.filter((id) => id !== origem);
  nova.splice(para, 0, origem);
  return nova;
}
