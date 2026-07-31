"use client";

type Size = "sm" | "md" | "lg";
type Variant = "framed" | "ghost";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Estado ligado/aberto — só tem efeito em `variant="framed"`. */
  active?: boolean;
  hasDot?: boolean;
  size?: Size;
  variant?: Variant;
};

// 28px: ação inline em linha de tabela/lista · 32px: padrão, casa com
// <Button size="sm"> (h-8) · 38px: controle de topbar.
const SIZE_CLASS: Record<Size, string> = {
  sm: "w-7 h-7",
  md: "w-8 h-8",
  lg: "w-[38px] h-[38px]",
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

export function IconButton({
  active = false,
  hasDot = false,
  size = "md",
  variant = "ghost",
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={rest.type ?? "button"}
      className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-md transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${SIZE_CLASS[size]} ${VARIANT_CLASS[variant](active)} ${className}`.trim()}
      {...rest}
    >
      {children}
      {hasDot && (
        <span className="absolute top-[7px] right-2 w-[7px] h-[7px] rounded-full bg-danger border-2 border-surface-hover" />
      )}
    </button>
  );
}
