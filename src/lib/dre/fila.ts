// A fila de classificação da DRE: o que cada linha sem grupo deixa fazer, e o
// resumo do que ficou de fora de propósito. Função pura, sem banco.
//
// ─── Por que o casamento aqui é pela chave, e não pelo nome exato ───────────
//
// Até 13/10/2026 a tela procurava a categoria da linha pelo nome **exato**
// (`porNome.get(n.categoria)`), enquanto o de-para do cálculo, o import do
// Omie e a sincronização do Omie casam pela chave normalizada
// (`chaveDaCategoria`: sem caixa, sem acento, espaço colapsado). Uma linha do
// arquivo com "Compra de Matéria Prima -  Cantoneira" (dois espaços) e a
// categoria "Compra de Matéria Prima - Cantoneira" no plano: o import não
// cria outra (para ele são a mesma), o cálculo a acha (e, sem grupo, a manda
// para a fila), e a tela não a achava — a linha aparecia com "classifique na
// ficha dele" e nenhum controle. Aqui as três falam a mesma chave.

import { chaveDaCategoria, SEM_CATEGORIA, type ValorDaCategoria } from "@/lib/dre/calculo";
import { DESCONSIDERAR } from "@/lib/dre/estrutura";
import type { CategoriaResolvida } from "@/lib/dre/mapeamento";

export type FonteDaLinha = "import" | "financeiro";

/** O que a fila oferece numa linha. */
export type AcaoDaFila =
  /** A categoria existe no plano: o grupo vira exceção da empresa. */
  | { tipo: "classificar"; categoryId: string }
  /** Nome que veio no arquivo do Omie e o plano da empresa não tem: classificar cria a categoria. */
  | { tipo: "criar" }
  /** Sem categoria nenhuma: não há o que classificar aqui, só dizer onde corrigir. */
  | { tipo: "sem-categoria"; fontes: FonteDaLinha[] };

export type ItemDaFila = ValorDaCategoria & { acao: AcaoDaFila };

/** A categoria de cada chave. Com duas na mesma chave, a última — a da empresa, depois de `padraoAntesDaEmpresa`. */
function porChave(categorias: CategoriaResolvida[]): Map<string, CategoriaResolvida> {
  return new Map(categorias.map((c) => [chaveDaCategoria(c.nome), c]));
}

export type FontesDoPeriodo = {
  /** Algum mês do período saiu de arquivo importado. */
  temImport: boolean;
  /** De onde veio o "(sem categoria)" — no mês, a fonte dele; no ano, a dos meses em que apareceu. */
  doSemCategoria: FonteDaLinha[];
};

/**
 * As linhas da fila, do maior valor para o menor (em valor absoluto).
 *
 * Nome que não casa com categoria nenhuma só existe na fonte import — no
 * financeiro o nome sai da própria categoria —, e sem import no período ele é
 * tratado como lançamento sem categoria: não há arquivo de onde criá-la.
 */
export function itensDaFila(
  naoClassificado: ValorDaCategoria[],
  categorias: CategoriaResolvida[],
  fontes: FontesDoPeriodo
): ItemDaFila[] {
  const categoria = porChave(categorias);

  return naoClassificado
    .map((n): ItemDaFila => {
      if (n.categoria === SEM_CATEGORIA) return { ...n, acao: { tipo: "sem-categoria", fontes: fontes.doSemCategoria } };
      const achada = categoria.get(chaveDaCategoria(n.categoria));
      if (achada) return { ...n, acao: { tipo: "classificar", categoryId: achada.id } };
      return fontes.temImport ? { ...n, acao: { tipo: "criar" } } : { ...n, acao: { tipo: "sem-categoria", fontes: ["financeiro"] } };
    })
    .sort((a, b) => Math.abs(b.centavos) - Math.abs(a.centavos));
}

/** O total que a fila mostra: soma dos valores absolutos — recebido e pago não se anulam no que falta classificar. */
export function totalForaDasLinhas(itens: { centavos: number }[]): number {
  return itens.reduce((n, i) => n + Math.abs(i.centavos), 0);
}

export type Desconsiderada = {
  nome: string;
  /** No período, com sinal (pagamento negativo). Nulo quando não teve movimento. */
  centavos: number | null;
  origem: "recebimento" | "pagamento" | null;
  /** A categoria por trás, para o "Voltar ao padrão". */
  categoryId: string | null;
  /**
   * A empresa decidiu (exceção) — dá para voltar ao padrão aqui. Senão a
   * decisão está no plano de contas (do escritório ou da empresa), e é lá que
   * se desfaz.
   */
  excecao: boolean;
};

/**
 * O que ficou desconsiderado: as categorias com valor no período, e também as
 * exceções da empresa para "desconsiderar" sem valor nele — senão uma decisão
 * da empresa sumiria da tela no mês em que a categoria não andou, e não teria
 * onde desfazer.
 */
export function desconsideradasDoPeriodo(
  desconsiderado: ValorDaCategoria[],
  categorias: CategoriaResolvida[]
): Desconsiderada[] {
  const categoria = porChave(categorias.filter((c) => c.grupo === DESCONSIDERAR));
  const vistas = new Set<string>();

  const comValor = desconsiderado.map((d): Desconsiderada => {
    const c = categoria.get(chaveDaCategoria(d.categoria));
    if (c) vistas.add(c.id);
    return { nome: d.categoria, centavos: d.centavos, origem: d.origem, categoryId: c?.id ?? null, excecao: c?.origem === "excecao" };
  });

  const semValor = categorias
    .filter((c) => c.grupo === DESCONSIDERAR && c.origem === "excecao" && !vistas.has(c.id))
    .map((c): Desconsiderada => ({ nome: c.nome, centavos: null, origem: null, categoryId: c.id, excecao: true }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...comValor, ...semValor];
}

/** As exceções da empresa que não são "desconsiderar" — essas têm o resumo próprio. */
export function excecoesDaEmpresa(categorias: CategoriaResolvida[]): { categoryId: string; nome: string; grupo: string }[] {
  return categorias
    .filter((c) => c.origem === "excecao" && c.grupo !== null && c.grupo !== DESCONSIDERAR)
    .map((c) => ({ categoryId: c.id, nome: c.nome, grupo: c.grupo! }));
}
