"use client";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
};

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "bg-surface-hover text-fg border border-border-strong hover:bg-surface",
  ghost: "bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
  danger: "bg-danger-bg text-danger border border-danger hover:bg-danger hover:text-white",
};

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-[18px] text-[length:var(--fs-button)]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: Props) {
  return (
    <button
      type={rest.type ?? "button"}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[10px] font-semibold transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim()}
      {...rest}
    >
      {loading ? "Salvando…" : children}
    </button>
  );
}
