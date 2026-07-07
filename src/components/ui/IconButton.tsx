"use client";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  hasDot?: boolean;
};

// Botão quadrado de ícone (topbar, ações de card) — nunca ícone "solto" sem
// fundo/borda própria. `hasDot` desenha o indicador de notificação não lida.
export function IconButton({ active = false, hasDot = false, className = "", children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`relative w-[38px] h-[38px] inline-flex items-center justify-center rounded-[10px] border transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed ${
        active
          ? "bg-surface border-border-strong text-fg shadow-sm"
          : "bg-surface-hover border-border text-fg-secondary hover:text-fg hover:border-border-strong"
      } ${className}`.trim()}
      {...rest}
    >
      {children}
      {hasDot && (
        <span className="absolute top-[7px] right-2 w-[7px] h-[7px] rounded-full bg-danger border-2 border-surface-hover" />
      )}
    </button>
  );
}
