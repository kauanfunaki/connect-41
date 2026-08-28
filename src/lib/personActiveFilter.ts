// Regra do que a listagem de pessoas mostra por padrão.
//
// Mesma decisão de produto do src/lib/companyStatusFilter.ts, mas o dado é diferente:
// pessoa tem um booleano `active`, empresa tem um enum de status. Por isso são dois
// módulos e não um genérico — juntar os dois exigiria um tipo que não descreve nem um
// nem outro direito.
//
// Antes desta regra a listagem trazia inativos junto dos ativos, sem separação.

/** Valor de `?situacao=` que traz todo mundo. */
export const SITUACAO_TODOS = "todos";
/** Valor de `?situacao=` que traz só quem está inativo. */
export const SITUACAO_INATIVOS = "inativos";

export type PersonActiveFilter =
  | { kind: "ativos" }
  | { kind: "inativos" }
  | { kind: "todos" };

/** Valor desconhecido cai no padrão, em vez de deixar a tela vazia sem explicação. */
export function resolvePersonActiveFilter(param: string | undefined): PersonActiveFilter {
  const valor = (param ?? "").trim();
  if (valor === SITUACAO_TODOS) return { kind: "todos" };
  if (valor === SITUACAO_INATIVOS) return { kind: "inativos" };
  return { kind: "ativos" };
}

/** Fragmento de `where` do Prisma correspondente ao filtro. */
export function personActiveWhere(filtro: PersonActiveFilter) {
  switch (filtro.kind) {
    case "todos":
      return {};
    case "inativos":
      return { active: false };
    case "ativos":
      return { active: true };
  }
}

/** True quando a tela está escondendo inativos — a UI avisa quantos. */
export function estaOcultandoInativos(filtro: PersonActiveFilter): boolean {
  return filtro.kind === "ativos";
}

/** Valor a marcar como selecionado no menu de filtro ("" = padrão). */
export function situacaoSelecionada(filtro: PersonActiveFilter): string {
  switch (filtro.kind) {
    case "todos":
      return SITUACAO_TODOS;
    case "inativos":
      return SITUACAO_INATIVOS;
    case "ativos":
      return "";
  }
}
