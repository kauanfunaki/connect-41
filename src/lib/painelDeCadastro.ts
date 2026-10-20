/**
 * O endereço abre o painel ao lado da lista (`?novo=1`, `?editar=<id>`),
 * da escolha 2B dos Ajustes de 15/10 — ver `PainelDeCadastro`. O link que
 * abre o painel não rola a lista para o topo: a graça é editar a linha 40 sem
 * perder o lugar.
 */
export function abreNoPainel(href: string): boolean {
  return /[?&](novo|editar)=/.test(href);
}
