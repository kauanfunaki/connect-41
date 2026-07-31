"use client";

import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "xs" | "sm" | "md";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
};

const COMMON_KEYS = ["variant", "size", "className", "children"] as const;

function omitCommon<T extends CommonProps>(props: T): Omit<T, (typeof COMMON_KEYS)[number]> {
  const rest = { ...props };
  for (const key of COMMON_KEYS) delete rest[key];
  return rest;
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
    /** Troca o rótulo por "Salvando…" e desabilita. Só faz sentido em botão. */
    loading?: boolean;
  };

type LinkProps = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "href"> & {
    /** Com href o componente vira <Link>, com a mesma aparência. 85 lugares do
     *  app estilizavam um <Link> à mão pra parecer botão. */
    href: string;
    loading?: undefined;
  };

type Props = ButtonProps | LinkProps;

// secondary e danger foram recalibrados pra bater com o botão real do app,
// medido em dezenas de call-sites — o que este componente declarava antes
// era o oposto do que o app inteiro já usava:
// • secondary: era fundo cinza permanente. O "Cancelar" real (FormFooter,
//   ConfirmDialog, e a maioria dos formulários) não tem fundo em repouso —
//   só borda, e ganha fundo no hover.
// • danger: era fundo+borda sólidos, virando vermelho cheio no hover. O botão
//   de exclusão real (ui/DeleteButton.tsx, o próprio componente da biblioteca
//   com 10 consumidores) é borda translúcida, sem fundo em repouso, tingindo
//   levemente no hover — adotado aqui ao pé da letra.
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "border border-border-strong text-fg hover:bg-surface-hover",
  ghost: "bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
  danger: "border border-danger/30 text-danger hover:bg-danger/8",
};

// px-4/text-[length:var(--fs-ui)] no md também vieram de medição: o `h-9`
// real do app aparece esmagadoramente com padding 16px e texto 13px — não
// os 18px/15px que este componente declarava (--fs-button, que ninguém
// media até então).
const SIZE_CLASS: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[length:var(--fs-ui)]",
  sm: "h-8 px-3 text-[length:var(--fs-ui)]",
  md: "h-9 px-4 text-[length:var(--fs-ui)]",
};

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed";

export function Button(props: Props) {
  const { variant = "primary", size = "md", className = "", children } = props;
  const cls = `${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim();

  if (props.href !== undefined) {
    const { href, ...rest } = omitCommon(props);
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  const { loading = false, disabled, ...rest } = omitCommon(props);
  return (
    <button type={rest.type ?? "button"} disabled={disabled || loading} className={cls} {...rest}>
      {loading ? "Salvando…" : children}
    </button>
  );
}
