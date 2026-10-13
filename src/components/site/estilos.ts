// As classes que as partes do site de apresentação repetem (13/10/2026): a
// largura de cada faixa, o rótulo em caixa alta, o título de seção e os botões.
// Cores e fontes são os tokens do app (globals.css), nos dois temas.

// Largura e respiro de cada faixa da página: 16 px dos lados no celular.
export const FAIXA = "mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-14";

export const ROTULO = "text-fs-3 font-semibold uppercase tracking-[0.08em] text-brand";

// Títulos do site em escala própria: a do app para em 30 px (--fs-9), feita
// para tela de trabalho, e um site pede mais. O de seção cresce com a tela, de
// 26 a 34 px; o do bloco de destaque mora no BlocoDeDestaque.
export const TITULO_2 =
  "text-[length:clamp(1.625rem,1.35rem_+_1.1vw,2.125rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-fg text-balance";

// Os botões do site são links (`<a>` simples, para uma âncora da página ou para
// um e-mail) com o desenho do `ui/Button`, mais altos, como pede uma página de
// entrada. O `ui/Button` é componente de cliente, e um link simples não precisa
// dele.
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
export const PRIMARIO =
  "bg-brand-solid text-on-brand hover:bg-brand-solid-hover shadow-[var(--c41-shadow-xs),inset_0_1px_0_rgba(255,255,255,.14)]";

export const LINK = "transition-colors hover:text-brand";
