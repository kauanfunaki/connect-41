// Os endereços da Produtividade da Tech (05/11/2026). O módulo segue sendo o
// `tech_github_contributions`; o endereço é do módulo, sem o setor (decisão de
// 04/11), e o `/github` antigo redireciona (next.config.ts).
//
// Três abas (06/11/2026, pedido do Kauan): Painel (era "Time", renomeado para
// não confundir com os times dos devs), Pessoas (os desenvolvedores e os
// times, que eram abas do GitHub) e GitHub (só a visão geral, com um botão
// para os repositórios). Sem segunda fileira de abas.

export const ROTA_PRODUTIVIDADE = "/produtividade";

export const ROTAS_DA_PRODUTIVIDADE = {
  painel: ROTA_PRODUTIVIDADE,
  pessoas: `${ROTA_PRODUTIVIDADE}/pessoas`,
  github: `${ROTA_PRODUTIVIDADE}/github`,
} as const;
export type AbaDaProdutividade = keyof typeof ROTAS_DA_PRODUTIVIDADE;

/**
 * As telas que leem o GitHub, por visão do painel cliente: o Geral é a aba
 * GitHub; os desenvolvedores são a aba Pessoas; repositórios e times são
 * telas próprias, abertas por botão (sem aba).
 */
export const ROTAS_DO_GITHUB = {
  general: ROTAS_DA_PRODUTIVIDADE.github,
  developers: ROTAS_DA_PRODUTIVIDADE.pessoas,
  repositories: `${ROTAS_DA_PRODUTIVIDADE.github}/repositorios`,
  teams: `${ROTAS_DA_PRODUTIVIDADE.pessoas}/times`,
} as const;

/** A aba da Produtividade de um endereço, ou null fora dela. */
export function abaDaProdutividade(pathname: string): AbaDaProdutividade | null {
  if (pathname === ROTAS_DA_PRODUTIVIDADE.painel) return "painel";
  if (pathname === ROTAS_DA_PRODUTIVIDADE.pessoas || pathname.startsWith(`${ROTAS_DA_PRODUTIVIDADE.pessoas}/`)) return "pessoas";
  if (pathname === ROTAS_DA_PRODUTIVIDADE.github || pathname.startsWith(`${ROTAS_DA_PRODUTIVIDADE.github}/`)) return "github";
  return null;
}
