// Os endereços da Produtividade da Tech (05/11/2026). O módulo segue sendo o
// `tech_github_contributions`; o endereço é do módulo, sem o setor (decisão de
// 04/11), e o `/github` antigo redireciona (next.config.ts).
//
// Duas abas desde 09/11/2026 (pedido do Kauan): Pessoas, a de entrada (os
// desenvolvedores e os times), e GitHub (a visão geral, com um botão para os
// repositórios). O Painel, com os números do time, saiu: o endereço do módulo
// (`/produtividade`) redireciona para Pessoas. Sem segunda fileira de abas.

export const ROTA_PRODUTIVIDADE = "/produtividade";

export const ROTAS_DA_PRODUTIVIDADE = {
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
