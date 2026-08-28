import { CompanyStatus } from "@/generated/prisma/enums";

// Regra do que a listagem de empresas mostra por padrão.
//
// Antes desta regra, ausência de filtro significava "traga tudo" — inativas e canceladas
// no meio das ativas. O padrão passa a esconder o que saiu de operação, e ver inativa vira
// escolha explícita do usuário.
//
// Módulo puro de propósito: é regra de produto ("o que aparece na tela"), não detalhe de
// consulta, e erra em silêncio se ninguém testar — uma listagem que esconde demais parece
// uma listagem vazia.

/** Valor de `?status=` que significa "traga tudo, inclusive inativas". */
export const STATUS_TODOS = "todos";

/** Status que somem do padrão: a empresa saiu de operação. PROSPECT continua visível — é trabalho em andamento, não arquivo. */
export const STATUS_OCULTOS_POR_PADRAO: CompanyStatus[] = [CompanyStatus.INACTIVE, CompanyStatus.CHURNED];

export type CompanyStatusFilter =
  | { kind: "padrao" }
  | { kind: "todos" }
  | { kind: "status"; status: CompanyStatus };

/**
 * Traduz o `?status=` da URL em intenção.
 *
 * Valor desconhecido cai no padrão em vez de virar erro ou lista vazia: link velho ou
 * digitado à mão não deve deixar a tela em branco sem explicação.
 */
export function resolveCompanyStatusFilter(param: string | undefined): CompanyStatusFilter {
  const valor = (param ?? "").trim();
  if (!valor) return { kind: "padrao" };
  if (valor === STATUS_TODOS) return { kind: "todos" };
  if ((Object.values(CompanyStatus) as string[]).includes(valor)) {
    return { kind: "status", status: valor as CompanyStatus };
  }
  return { kind: "padrao" };
}

/** Fragmento de `where` do Prisma correspondente ao filtro. */
export function companyStatusWhere(filtro: CompanyStatusFilter) {
  switch (filtro.kind) {
    case "todos":
      return {};
    case "status":
      return { status: filtro.status };
    case "padrao":
      return { status: { notIn: STATUS_OCULTOS_POR_PADRAO } };
  }
}

/** True quando a tela está escondendo alguma coisa — a UI avisa em vez de deixar o usuário achar que a base está menor do que é. */
export function estaOcultandoInativas(filtro: CompanyStatusFilter): boolean {
  return filtro.kind === "padrao";
}

/** Valor a marcar como selecionado no menu de filtro. */
export function valorSelecionado(filtro: CompanyStatusFilter): string {
  switch (filtro.kind) {
    case "todos":
      return STATUS_TODOS;
    case "status":
      return filtro.status;
    case "padrao":
      return "";
  }
}
