/** O painel fiscal é uma página própria, não o item pai de todas as áreas. */
export function caminhoDoMenuAtivo(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/fiscal") return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * O item "Quadros" (`/setor/{code}`) acende nos Quadros — a raiz, os espaços,
 * as pastas e as listas, que abrem em `/kanban` — e não em qualquer
 * `/setor/{code}/…` (Ajustes 15/10, G6): as telas do setor (`/grupo`,
 * `/telas`, os módulos sem rota própria) moram debaixo do mesmo endereço e
 * acendiam Quadros junto.
 */
export function quadrosAtivo(pathname: string, code: string): boolean {
  const base = `/setor/${code}`;
  const dentro = (prefixo: string) => pathname === prefixo || pathname.startsWith(`${prefixo}/`);
  return pathname === base || dentro(`${base}/espacos`) || dentro(`${base}/pastas`) || dentro("/kanban");
}
