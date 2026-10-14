// O menu lateral recolhido no computador (08/10/2026, pedido do Kauan: um
// botão para fechar e abrir a lateral, à esquerda da troca de setor).
//
// Desde 14/10/2026, recolhido não some mais: vira uma **faixa de ícones** de
// 64px (desenho aprovado pelo Kauan). O mesmo botão, o mesmo cookie e o mesmo
// valor — quem tinha recolhido antes volta já na faixa, sem escolher de novo.
//
// A escolha mora num cookie, e não no localStorage: o layout lê no servidor e
// a página já nasce com o menu do jeito que a pessoa deixou — sem abrir e
// fechar na frente dela a cada carga.

export const COOKIE_DO_MENU_LATERAL = "c41_menu";
const RECOLHIDO = "recolhido";

/** O valor do cookie diz que o menu lateral está recolhido (na faixa de ícones). */
export function menuRecolhidoDoCookie(valor: string | undefined): boolean {
  return valor === RECOLHIDO;
}

/** O cookie que guarda a escolha (um ano), ou o que apaga quando o menu volta. */
export function cookieDoMenuLateral(recolhido: boolean): string {
  return recolhido
    ? `${COOKIE_DO_MENU_LATERAL}=${RECOLHIDO}; path=/; max-age=31536000; samesite=lax`
    : `${COOKIE_DO_MENU_LATERAL}=; path=/; max-age=0; samesite=lax`;
}

// ─── A faixa de ícones (14/10/2026) ─────────────────────────────────────────

/** A coluna aberta: 240px em toda largura — é também a largura da gaveta do celular. */
export const LARGURA_DA_COLUNA = "w-[240px]";

/**
 * A faixa: 64px, só de lg para cima. O servidor não sabe a largura da tela e
 * desenha a faixa quando o cookie pede; no celular, até a hidratação trocar
 * para o menu inteiro, a gaveta (fechada) continua com 240px — o `lg:` cuida
 * disso. O teste compila o globals.css e confere as duas larguras.
 */
export const LARGURA_DA_FAIXA = "lg:w-16";

/** A transição da largura, em ms (o `duration-200` da lateral). */
export const DURACAO_DA_TRANSICAO_MS = 200;

/**
 * Como a lateral fica na tela.
 *
 * - Computador: aberta ou na faixa de ícones, conforme o botão. Nas duas ela
 *   é o menu, e fica no Tab e no leitor de tela — a faixa não é menu
 *   escondido (até 14/10, recolhida, a lateral saía da tela e do Tab).
 * - Abaixo de lg: a gaveta de sempre, com o menu inteiro, seja qual for o
 *   cookie. Fechada, sai do Tab e do leitor de tela (`inert`).
 */
export function estadoDaLateral({
  telaGrande,
  recolhido,
  gavetaAberta,
}: {
  telaGrande: boolean;
  recolhido: boolean;
  gavetaAberta: boolean;
}): { naFaixa: boolean; foraDoTab: boolean } {
  if (telaGrande) return { naFaixa: recolhido, foraDoTab: false };
  return { naFaixa: false, foraDoTab: !gavetaAberta };
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
