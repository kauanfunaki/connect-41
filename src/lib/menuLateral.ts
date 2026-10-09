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
