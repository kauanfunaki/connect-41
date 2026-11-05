// Os endereços da Produtividade da Tech (05/11/2026). O módulo segue sendo o
// `tech_github_contributions`; o endereço é do módulo, sem o setor (decisão de
// 04/11), e o `/github` antigo redireciona para a aba GitHub (next.config.ts).

export const ROTA_PRODUTIVIDADE = "/produtividade";

export const ROTAS_DA_PRODUTIVIDADE = {
  time: ROTA_PRODUTIVIDADE,
  pessoas: `${ROTA_PRODUTIVIDADE}/pessoas`,
  github: `${ROTA_PRODUTIVIDADE}/github`,
} as const;
export type AbaDaProdutividade = keyof typeof ROTAS_DA_PRODUTIVIDADE;

/** As telas do GitHub, dentro da aba GitHub (as mesmas de antes, outro endereço). */
export const ROTAS_DO_GITHUB = {
  general: ROTAS_DA_PRODUTIVIDADE.github,
  developers: `${ROTAS_DA_PRODUTIVIDADE.github}/desenvolvedores`,
  repositories: `${ROTAS_DA_PRODUTIVIDADE.github}/repositorios`,
  teams: `${ROTAS_DA_PRODUTIVIDADE.github}/times`,
} as const;

/** A aba da Produtividade de um endereço, ou null fora dela. */
export function abaDaProdutividade(pathname: string): AbaDaProdutividade | null {
  if (pathname === ROTAS_DA_PRODUTIVIDADE.time) return "time";
  if (pathname === ROTAS_DA_PRODUTIVIDADE.pessoas || pathname.startsWith(`${ROTAS_DA_PRODUTIVIDADE.pessoas}/`)) return "pessoas";
  if (pathname === ROTAS_DA_PRODUTIVIDADE.github || pathname.startsWith(`${ROTAS_DA_PRODUTIVIDADE.github}/`)) return "github";
  return null;
}
