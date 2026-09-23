// As categorias que um import do Omie traz e o plano de contas ainda não tem.
//
// O DRE casa a categoria do arquivo pelo **nome** com `FinanceCategory` do
// escritório (ver `resolverCategorias`). Categoria que só existia no Omie ficava
// "sem categoria": fora do relatório e sem onde classificar — a fila pedia para
// classificar "na ficha dele", e a ficha não existia. Achado ao importar a
// Irriga de ago/26 em 23/09: R$ 1,13 milhão em 8 categorias, nenhuma
// classificável.
//
// O import passa a criar as que faltam, já com o grupo do de-para padrão da 41
// quando ele conhece o nome (`MAPEAMENTO_PADRAO`, extraído da Irriga). O que o
// padrão não conhece nasce sem grupo e cai na fila, agora classificável.
//
// Só cria. Categoria que já existe não é tocada — o grupo dela é decisão de
// alguém do escritório, e um import não desfaz decisão de gente.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import { MAPEAMENTO_PADRAO } from "@/lib/dre/mapeamento-padrao";

const GRUPO_PADRAO = new Map(MAPEAMENTO_PADRAO.map((p) => [chaveDaCategoria(p.categoria), p.grupo]));

export type CategoriaNova = { name: string; kind: "PAGAR" | "RECEBER"; dreGroup: string | null };

/** Limite da coluna `FinanceCategory.name`. */
const MAX_NOME = 120;

export function categoriasParaCriar(
  nomesNoArquivo: (string | null)[],
  nomesExistentes: string[],
  origem: "pagamento" | "recebimento"
): CategoriaNova[] {
  const existentes = new Set(nomesExistentes.map(chaveDaCategoria));
  const novas = new Map<string, CategoriaNova>();
  for (const bruto of nomesNoArquivo) {
    const nome = bruto?.trim().replace(/\s+/g, " ").slice(0, MAX_NOME);
    if (!nome) continue;
    const k = chaveDaCategoria(nome);
    if (existentes.has(k) || novas.has(k)) continue;
    novas.set(k, {
      name: nome,
      kind: origem === "pagamento" ? "PAGAR" : "RECEBER",
      dreGroup: GRUPO_PADRAO.get(k) ?? null,
    });
  }
  return [...novas.values()];
}
