/** O painel fiscal é uma página própria, não o item pai de todas as áreas. */
export function caminhoDoMenuAtivo(pathname: string, href: string): boolean {
  const base = href.split("?")[0];
  if (base === "/fiscal") return pathname === base;
  return pathname === base || pathname.startsWith(`${base}/`);
}
