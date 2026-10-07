"use client";

import Link from "next/link";

type Size = "sm" | "md" | "lg" | "xl";
type Variant = "framed" | "ghost";

type Comum = {
  /** Estado ligado/aberto — só tem efeito em `variant="framed"`. */
  active?: boolean;
  hasDot?: boolean;
  size?: Size;
  variant?: Variant;
  className?: string;
  children?: React.ReactNode;
};

type ComoBotao = Comum & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof Comum> & { href?: undefined };

/** Com `href` vira `<Link>`, no mesmo desenho — como o `Button`. Configurações,
 *  no topo, copiava o `framed lg` à mão num `<Link>` (07/10/2026). */
type ComoLink = Comum &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof Comum | "href"> & {
    href: string;
  };

// 28px: ação miúda de uma linha de lista, sem controle ao lado · 32px: padrão,
// casa com campo `compact` e
// <Button size="sm"> (h-8) · 38px: controle de topbar · 40px: alvo de toque
// do celular (menu, busca e fechar da gaveta), que estavam em 18-20px (07/10/2026).
const SIZE_CLASS: Record<Size, string> = {
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-[38px] h-[38px]",
  xl: "w-10 h-10",
};

// Duas leituras diferentes, ambas reais no app:
// • framed — o controle é um destino permanente (topbar). Fundo e borda sempre
//   visíveis, e estado `active` quando o painel dele está aberto.
// • ghost — a ação é secundária e mora dentro de outro conteúdo (fechar um
//   modal, menu de uma linha de tabela). Fica discreta até o hover, pra não
//   competir com o conteúdo. É o padrão dominante no app.
const VARIANT_CLASS: Record<Variant, (active: boolean) => string> = {
  framed: (active) =>
    active
      ? "border bg-surface border-border-strong text-fg shadow-sm"
      : "border bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong",
  ghost: () => "text-fg-muted hover:text-fg hover:bg-surface-hover",
};

/**
 * As classes do controle, para quem precisa do mesmo desenho num elemento que
 * não é este componente — o botão dividido da ajuda, o gatilho do perfil.
 */
export function classeDoIconButton({
  size = "md",
  variant = "ghost",
  active = false,
}: { size?: Size; variant?: Variant; active?: boolean } = {}): string {
  return `inline-flex items-center justify-center flex-shrink-0 rounded-md transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant](active)}`;
}

export function IconButton(props: ComoBotao | ComoLink) {
  const { active = false, hasDot = false, size = "md", variant = "ghost", className = "", children } = props;
  const cls = `${hasDot ? "relative " : ""}${classeDoIconButton({ size, variant, active })} ${className}`.trim();
  const ponto = hasDot && (
    <span className="absolute top-[7px] right-2 w-[7px] h-[7px] rounded-full bg-danger border-2 border-surface-hover" />
  );

  if (props.href !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { active: _a, hasDot: _h, size: _s, variant: _v, className: _c, children: _ch, href, ...rest } = props;
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
        {ponto}
      </Link>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { active: _a, hasDot: _h, size: _s, variant: _v, className: _c, children: _ch, href: _href, ...rest } = props;
  return (
    <button type={rest.type ?? "button"} className={cls} {...rest}>
      {children}
      {ponto}
    </button>
  );
}
