// As classes que as partes do site de apresentação repetem (13/10/2026,
// versão 3): a largura de cada faixa, o respiro das seções, os títulos, os
// cartões e os botões. Cores e fontes são os tokens do app (globals.css), nos
// dois temas.

// Largura e respiro de cada faixa da página: 16 px dos lados no celular.
export const FAIXA = "mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-14";

// O espaço em cima e embaixo de cada seção. A versão 2 era apertada; a 3
// respira mais, como pede uma página de apresentação.
export const RESPIRO = "py-20 sm:py-24 lg:py-32";

// Títulos do site em escala própria: a do app para em 30 px (--fs-9), feita
// para tela de trabalho, e um site pede mais. O de seção cresce com a tela,
// de 30 a 52 px; o da primeira dobra mora nela. Sem cor: a seção escura (a
// Ceci, a segurança) escreve em branco, as outras em `text-fg`.
export const TITULO_2 =
  "font-display text-[length:clamp(1.875rem,1.15rem_+_2.6vw,3.25rem)] font-medium leading-[1.04] tracking-[-0.03em] text-balance";

// O texto de abertura embaixo do título de cada seção.
export const ABERTURA = "text-fs-6 leading-relaxed sm:text-fs-7";

// Cartão das seções claras (as portas, o mosaico do Connect): o azul-claro do
// fundo do app sobre a página branca; no escuro, a superfície sobre o fundo.
export const CARTAO = "rounded-[22px] border border-border bg-canvas dark:bg-surface";

// Os botões do site são links (`<a>` simples, para uma âncora da página, para
// o Connect ou para um e-mail) com o desenho do `ui/Button`. O `ui/Button` é
// componente de cliente, e um link simples não precisa dele.
//
// Rótulo de botão é UM texto só. O botão é `inline-flex` com `gap-2`, para o
// ícone ficar afastado do texto, e cada pedaço solto dentro dele vira um item
// do flex. Na primeira versão o "Entrar" do topo era `Entrar<span>&nbsp;no
// Connect</span>` (o fim sumia no celular): os dois pedaços ganhavam os 8 px do
// gap além do espaço, e a tela mostrava "Entrar   no Connect". Ícone pode ir
// junto, que é ele que o gap afasta; texto partido em pedaços, não.
const BOTAO =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px";
export const BOTAO_GRANDE = `${BOTAO} h-11 px-5 text-fs-5 sm:h-12 sm:px-6`;
// O do topo: mais baixo e, no celular, mais estreito, para caber ao lado do
// logo e do menu em 360 px.
export const BOTAO_DO_TOPO = `${BOTAO} h-9 px-3 text-fs-4 sm:h-10 sm:px-4`;
export const PRIMARIO =
  "bg-brand-solid text-on-brand hover:bg-brand-solid-hover shadow-[var(--c41-shadow-xs),inset_0_1px_0_rgba(255,255,255,.14)]";

export const LINK = "transition-colors hover:text-brand";

/**
 * A cor do ponto de um setor nas etiquetas da seção Planos: a do tema do site
 * (`--c41-sector-*`); sem a variável, a cor do cadastro.
 */
export function corDoSetor(code: string, cor: string): string {
  return `var(--c41-sector-${code === "dp" ? "dprh" : code}, ${cor})`;
}
