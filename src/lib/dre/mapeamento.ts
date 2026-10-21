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

import {
  DESCONSIDERAR,
  GRUPOS,
  GRUPO_DO_ANTIGO,
  MODELO_PADRAO,
  ROTULOS_DO_PADRAO_ANTIGO,
  TRANSFERENCIA,
  type CodigoDoModelo,
  type ModeloDoDre,
} from "@/lib/dre/estrutura";

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
// O código e o rótulo do seletor (13/10/2026) — `dreGroup` é texto livre, e
// quem digitar o rótulo no plano tem de cair no mesmo lugar de quem escolheu.
POR_CHAVE.set(chave(DESCONSIDERAR), DESCONSIDERAR);
POR_CHAVE.set(chave("Desconsiderar no DRE"), DESCONSIDERAR);
// Os códigos e os rótulos do padrão antigo (o da Irriga, até 20/10/2026) caem
// no grupo novo — um `dreGroup` que a migration não pegou, uma planilha antiga
// importada, alguém que digita "Despesas Fixas (Pessoal)": nenhum vira não
// classificado por causa da troca.
for (const [antigo, novo] of Object.entries(GRUPO_DO_ANTIGO)) POR_CHAVE.set(chave(antigo), novo);
for (const [rotulo, novo] of Object.entries(ROTULOS_DO_PADRAO_ANTIGO)) if (!POR_CHAVE.has(chave(rotulo))) POR_CHAVE.set(chave(rotulo), novo);

// Os outros modelos (21/10/2026) casam o código e o rótulo dos grupos deles e
// as escolhas de fora — e só. O código de um grupo do padrão que o modelo não
// tem ("custo_operacional" no por área) não vira grupo nenhum: pode ser CMV,
// mão de obra ou comerciais, e escolher um seria inventar. Fica sem grupo, para
// alguém classificar.
const POR_CHAVE_DO_MODELO = new Map<CodigoDoModelo, Map<string, string>>([["padrao", POR_CHAVE]]);

function chavesDo(modelo: ModeloDoDre): Map<string, string> {
  let mapa = POR_CHAVE_DO_MODELO.get(modelo.codigo);
  if (!mapa) {
    mapa = new Map<string, string>();
    for (const g of modelo.grupos) {
      mapa.set(chave(g.code), g.code);
      mapa.set(chave(g.label), g.code);
    }
    for (const fora of [TRANSFERENCIA, "Transferência entre contas"]) mapa.set(chave(fora), TRANSFERENCIA);
    for (const fora of [DESCONSIDERAR, "Desconsiderar no DRE"]) mapa.set(chave(fora), DESCONSIDERAR);
    POR_CHAVE_DO_MODELO.set(modelo.codigo, mapa);
  }
  return mapa;
}

/**
 * O código de grupo que este texto significa no modelo, ou `null`.
 *
 * `null` em texto que não bate é deliberado, e é o oposto de escolher o grupo
 * mais parecido: um valor no grupo errado sai no relatório como se estivesse
 * certo, e ninguém confere o que parece certo. Não classificado é visível.
 */
export function grupoDeTexto(texto: string | null | undefined, modelo: ModeloDoDre = MODELO_PADRAO): string | null {
  if (!texto) return null;
  return chavesDo(modelo).get(chave(texto)) ?? null;
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
  excecoes: ExcecaoDaEmpresa[],
  modelo: ModeloDoDre = MODELO_PADRAO
): CategoriaResolvida[] {
  const porCategoria = new Map(excecoes.map((e) => [e.categoryId, e.grupo]));

  return categorias.map((c) => {
    const excecao = porCategoria.get(c.id);
    // Exceção que aponta para grupo inexistente é erro de dado, e tratá-la como
    // válida faria o valor sumir num grupo que nenhuma linha soma. Cai para o
    // padrão, e se o padrão também não resolver, para o não classificado.
    const daExcecao = excecao ? grupoDeTexto(excecao, modelo) : null;
    if (daExcecao) return { id: c.id, nome: c.nome, grupo: daExcecao, origem: "excecao" as const };

    const doPadrao = grupoDeTexto(c.dreGroup, modelo);
    if (doPadrao) return { id: c.id, nome: c.nome, grupo: doPadrao, origem: "padrao" as const };

    return { id: c.id, nome: c.nome, grupo: null, origem: null };
  });
}

/** Quantas categorias ainda não têm grupo. É o número do aviso na tela. */
export function contarSemGrupo(resolvidas: CategoriaResolvida[]): number {
  return resolvidas.filter((c) => c.grupo === null).length;
}
