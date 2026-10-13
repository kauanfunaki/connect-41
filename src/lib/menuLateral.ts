// O menu lateral recolhido no computador (08/10/2026, pedido do Kauan: um
// botão para fechar e abrir a lateral, à esquerda da troca de setor).
//
// A escolha mora num cookie, e não no localStorage: o layout lê no servidor e
// a página já nasce com o menu do jeito que a pessoa deixou — sem abrir e
// fechar na frente dela a cada carga.

export const COOKIE_DO_MENU_LATERAL = "c41_menu";
const RECOLHIDO = "recolhido";

/** O valor do cookie diz que o menu lateral está recolhido. */
export function menuRecolhidoDoCookie(valor: string | undefined): boolean {
  return valor === RECOLHIDO;
}

/** O cookie que guarda a escolha (um ano), ou o que apaga quando o menu volta. */
export function cookieDoMenuLateral(recolhido: boolean): string {
  return recolhido
    ? `${COOKIE_DO_MENU_LATERAL}=${RECOLHIDO}; path=/; max-age=31536000; samesite=lax`
    : `${COOKIE_DO_MENU_LATERAL}=; path=/; max-age=0; samesite=lax`;
}

// ─── Um botão de menu por vez no topo (13/10/2026) ──────────────────────────
//
// A partir de lg a lateral é coluna fixa; abaixo, gaveta. No topo, cada modo
// tem o seu botão: na gaveta, o hambúrguer que abre o menu; na coluna, o que
// recolhe e mostra a lateral. Os dois nunca juntos.
//
// Em 13/10 os dois apareciam lado a lado ao estreitar a janela: o de recolher
// levava `hidden lg:inline-flex`, mas o `IconButton` já traz `inline-flex` na
// base, e no CSS do Tailwind `.inline-flex` vem depois de `.hidden` — ganhava
// o `inline-flex`, e o botão ficava em toda largura. Por isso cada um some com
// uma variante (`lg:` / `max-lg:`), que sai depois da base e sempre vence.
// O teste compila o globals.css e confere as duas larguras.

/** A largura em que a lateral vira coluna fixa — o `lg` do Tailwind (64rem). */
export const TELA_GRANDE = "(min-width: 1024px)";

/** Só na gaveta (abaixo de lg): o hambúrguer do topo e o "fechar" da gaveta. */
export const SO_NA_GAVETA = "lg:hidden";

/** Só com a coluna fixa (de lg para cima): o botão de recolher e mostrar. */
export const SO_NA_COLUNA = "max-lg:hidden";
