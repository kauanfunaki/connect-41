// Como uma categoria vira um grupo do DRE.
//
// ─── Duas fontes, uma precedência ───────────────────────────────────────────
//
// 1. **Exceção da empresa** (`DreCategoryMapping`) — quando existe, ganha.
// 2. **Padrão do escritório** (`FinanceCategory.dreGroup`) — o plano de contas,
//    que já existia e já tem tela.
//
// Não há terceira. Categoria que não resolve por nenhuma das duas cai no não
// classificado, aparece na tela com o valor, e alguém decide — em vez de sumir
// do relatório, que é o que a planilha faz hoje.
//
// ─── Por que o padrão aceita rótulo, e não só código ────────────────────────
//
// `dreGroup` é campo livre desde antes deste módulo, e o plano de contas de um
// cliente pode já ter "Despesas Fixas (Pessoal)" digitado à mão. Casar por
// rótulo além do código faz esse trabalho aproveitar, em vez de exigir que
// alguém reescreva doze linhas para o relatório sair.

import { GRUPOS, TRANSFERENCIA } from "@/lib/dre/estrutura";

/** Normaliza para comparar: sem acento, sem caixa, espaço colapsado. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const POR_CHAVE = new Map<string, string>();
for (const g of GRUPOS) {
  POR_CHAVE.set(chave(g.code), g.code);
  POR_CHAVE.set(chave(g.label), g.code);
}
POR_CHAVE.set(chave(TRANSFERENCIA), TRANSFERENCIA);
POR_CHAVE.set(chave("Transferência entre contas"), TRANSFERENCIA);

/**
 * O código de grupo que este texto significa, ou `null`.
 *
 * `null` em texto que não bate é deliberado, e é o oposto de escolher o grupo
 * mais parecido: um valor no grupo errado sai no relatório como se estivesse
 * certo, e ninguém confere o que parece certo. Não classificado é visível.
 */
export function grupoDeTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return POR_CHAVE.get(chave(texto)) ?? null;
}

export type CategoriaParaMapear = {
  id: string;
  nome: string;
  /** `FinanceCategory.dreGroup` — o padrão do escritório. */
  dreGroup: string | null;
};

/** Uma exceção declarada para uma empresa. */
export type ExcecaoDaEmpresa = { categoryId: string; grupo: string };

export type OrigemDoGrupo = "excecao" | "padrao" | null;

export type CategoriaResolvida = {
  id: string;
  nome: string;
  grupo: string | null;
  origem: OrigemDoGrupo;
};

/**
 * Resolve todas as categorias de uma vez, com a precedência.
 *
 * Devolve `origem` junto porque a tela precisa distinguir três coisas que
 * parecem iguais quando só se olha o grupo: "o escritório definiu", "esta
 * empresa foge do padrão" e "ninguém definiu". Sem isso, desfazer uma exceção
 * vira adivinhação.
 */
export function resolverCategorias(
  categorias: CategoriaParaMapear[],
  excecoes: ExcecaoDaEmpresa[]
): CategoriaResolvida[] {
  const porCategoria = new Map(excecoes.map((e) => [e.categoryId, e.grupo]));

  return categorias.map((c) => {
    const excecao = porCategoria.get(c.id);
    // Exceção que aponta para grupo inexistente é erro de dado, e tratá-la como
    // válida faria o valor sumir num grupo que nenhuma linha soma. Cai para o
    // padrão, e se o padrão também não resolver, para o não classificado.
    const daExcecao = excecao ? grupoDeTexto(excecao) : null;
    if (daExcecao) return { id: c.id, nome: c.nome, grupo: daExcecao, origem: "excecao" as const };

    const doPadrao = grupoDeTexto(c.dreGroup);
    if (doPadrao) return { id: c.id, nome: c.nome, grupo: doPadrao, origem: "padrao" as const };

    return { id: c.id, nome: c.nome, grupo: null, origem: null };
  });
}

/** Quantas categorias ainda não têm grupo. É o número do aviso na tela. */
export function contarSemGrupo(resolvidas: CategoriaResolvida[]): number {
  return resolvidas.filter((c) => c.grupo === null).length;
}
