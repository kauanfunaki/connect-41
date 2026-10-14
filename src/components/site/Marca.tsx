// As peças da marca que o site repete (13/10/2026, versão 3): o logo, o anel
// do símbolo como motivo gráfico e o rótulo das seções, que leva o anel.

/** O logo horizontal, na versão de cada tema. */
export function Logo({ className }: { className: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-horizontal-light.svg" alt="Connect" className={`block w-auto dark:hidden ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className={`hidden w-auto dark:block ${className}`} />
    </>
  );
}

/**
 * O símbolo do Connect desenhado em código, na cor do texto (`currentColor`):
 * o anel aberto (abertura de 80°, virada para a direita), o ponto do meio e o
 * nó na abertura — as proporções de public/brand/symbol-color.svg, as mesmas
 * da Ceci (components/ia/Ceci). Decorativo.
 */
export function AnelDoConnect({ className = "", centro = true }: { className?: string; centro?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden focusable="false" className={className}>
      <path d="M 92.47 31.07 A 45 45 0 1 0 92.47 88.93" fill="none" stroke="currentColor" strokeWidth={13} strokeLinecap="round" />
      {centro && <circle cx={58} cy={60} r={13} fill="currentColor" />}
      <circle cx={103} cy={60} r={10} fill="currentColor" />
    </svg>
  );
}

/**
 * O rótulo em cima do título de cada seção: o anel pequeno e o texto em caixa
 * alta, na letra mono do app. `escuro` é para as seções de fundo escuro: o
 * azul-claro passa nas duas (11,6:1 no palco da Ceci, 5,0:1 no azul do
 * painel de segurança, no tom mais claro dele).
 */
export function Rotulo({ children, escuro = false }: { children: string; escuro?: boolean }) {
  return (
    <p
      className={`inline-flex items-center gap-2 font-mono text-fs-2 font-medium uppercase tracking-[0.14em] ${
        escuro ? "text-[#C9DAFF]" : "text-brand"
      }`}
    >
      <AnelDoConnect className="size-3.5 flex-none" />
      {children}
    </p>
  );
}
