"use client";

import { ChevronDown } from "lucide-react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
  /**
   * Variante enxuta pra barras de ferramentas (filtros e seletores de visão ao
   * lado de botões), pelo mesmo motivo do `compact` do Input: ali o tamanho de
   * formulário — 36px de altura e 16px de fonte — destoa dos controles de
   * 32px/12px em volta. Formulário continua no tamanho padrão (ver o comentário
   * em Input.tsx: 16px é o que evita o zoom automático do Safari no iOS).
   */
  compact?: boolean;
};

// O chevron é um elemento JSX sobreposto (não background-image em CSS) — o
// wrapper recebe o className do caller para larguras (w-auto, w-44 etc.).
export function Select({ error = false, compact = false, className = "", disabled, children, ...rest }: Props) {
  const sizeClass = compact ? "h-8 text-[13px]" : "h-9 text-[length:var(--fs-input)]";
  return (
    <div className={`relative ${className}`.trim()}>
      <select
        disabled={disabled}
        className={`c41-select w-full ${sizeClass} pl-3 pr-8 rounded-[10px] border bg-input-bg text-fg outline-none transition-colors appearance-none cursor-pointer ${
          error
            ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
            : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
        } disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed`}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
        aria-hidden
      />
    </div>
  );
}
