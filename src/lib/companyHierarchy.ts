// Hierarquia matriz→filial entre empresas (`Company.parentCompanyId`).
//
// A regra pura de montagem da árvore fica aqui e é testada sem Prisma; o que
// precisa de banco (opções do select, detecção de ciclo) vive em
// `companyHierarchyDb.ts`.

/** Empresa no mínimo que a árvore precisa enxergar. */
export type EmpresaNaArvore = {
  id: string;
  parentCompanyId: string | null;
};

export type NoDaArvore<T> = {
  matriz: T;
  filiais: T[];
};

/**
 * Monta a árvore de uma página de empresas, **preservando a ordem recebida**.
 *
 * Uma filial cuja matriz não está na mesma página sobe para o topo como se
 * fosse matriz. É de propósito: a alternativa seria escondê-la, e sumir com
 * uma empresa da listagem porque a matriz caiu na página anterior é pior que
 * mostrá-la fora do lugar. A tela marca essas com o nome da matriz ao lado.
 */
export function montarArvore<T extends EmpresaNaArvore>(empresas: T[]): NoDaArvore<T>[] {
  const presentes = new Set(empresas.map((e) => e.id));
  const filiaisPorMatriz = new Map<string, T[]>();

  for (const e of empresas) {
    if (e.parentCompanyId === null || !presentes.has(e.parentCompanyId)) continue;
    const atual = filiaisPorMatriz.get(e.parentCompanyId);
    if (atual) atual.push(e);
    else filiaisPorMatriz.set(e.parentCompanyId, [e]);
  }

  const nos: NoDaArvore<T>[] = [];
  for (const e of empresas) {
    // Entra como raiz quem não tem matriz ou cuja matriz não está nesta página.
    if (e.parentCompanyId !== null && presentes.has(e.parentCompanyId)) continue;
    nos.push({ matriz: e, filiais: filiaisPorMatriz.get(e.id) ?? [] });
  }
  return nos;
}

/**
 * Quantos níveis a cadeia de matrizes pode ter antes de ser considerada ciclo.
 *
 * Não existe hierarquia societária legítima com 10 níveis de matriz; se a
 * caminhada passar disso, os dados estão em anel e a consulta que os percorre
 * nunca terminaria.
 */
export const PROFUNDIDADE_MAXIMA = 10;

/**
 * Decide se apontar `empresaId` para `novaMatrizId` fecha um ciclo, dado o
 * mapa de quem é matriz de quem.
 *
 * Separado do banco para poder ser testado: quem lê as linhas é
 * `companyHierarchyDb.ts`, que passa o mapa pronto.
 */
export function criaCiclo(
  empresaId: string,
  novaMatrizId: string,
  matrizDe: Map<string, string | null>
): boolean {
  if (empresaId === novaMatrizId) return true;

  let atual: string | null = novaMatrizId;
  for (let i = 0; i < PROFUNDIDADE_MAXIMA; i++) {
    if (atual === null) return false;
    if (atual === empresaId) return true;
    atual = matrizDe.get(atual) ?? null;
  }
  // Estourou a profundidade sem fechar: trata como ciclo. Recusar um cadastro
  // legítimo raríssimo é melhor que gravar um anel que trava a listagem.
  return true;
}

/**
 * Decide quais empresas entram numa página, contando MATRIZES em vez de linhas.
 *
 * Paginar por linha quebra a árvore: com `PER_PAGE = 20` e uma matriz de 21
 * filiais, o corte cai no meio do grupo e as filiais remanescentes aparecem
 * soltas na página seguinte, como se não tivessem matriz. Foi o que aconteceu
 * com a BLD.
 *
 * Aqui a página é medida em nós de topo, e as filiais vêm junto de graça — o
 * que significa que uma página pode ter bem mais que `porPagina` linhas. É o
 * preço certo: a alternativa é uma árvore partida, que mente sobre o dado.
 *
 * Recebe a lista JÁ ORDENADA e devolve o conjunto de ids da página mais o total
 * de páginas, para a consulta seguinte buscar só o que interessa.
 */
export function idsDaPagina<T extends EmpresaNaArvore>(
  empresas: T[],
  pagina: number,
  porPagina: number
): { ids: string[]; totalPaginas: number; totalRaizes: number } {
  const presentes = new Set(empresas.map((e) => e.id));

  // Raiz é quem não tem matriz OU cuja matriz ficou fora do filtro atual — uma
  // busca por "filial 20" traz a filial sem a matriz, e ela precisa aparecer.
  const raizes = empresas.filter(
    (e) => e.parentCompanyId === null || !presentes.has(e.parentCompanyId)
  );

  const totalPaginas = Math.max(1, Math.ceil(raizes.length / porPagina));
  const inicio = (pagina - 1) * porPagina;
  const daPagina = raizes.slice(inicio, inicio + porPagina);

  const ids = new Set(daPagina.map((r) => r.id));
  for (const e of empresas) {
    if (e.parentCompanyId !== null && ids.has(e.parentCompanyId)) ids.add(e.id);
  }

  return { ids: [...ids], totalPaginas, totalRaizes: raizes.length };
}
