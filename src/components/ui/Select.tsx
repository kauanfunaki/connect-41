"use client";

import { ChevronDown } from "lucide-react";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
};

// O chevron é um elemento JSX sobreposto (não background-image em CSS) — o
// wrapper recebe o className do caller para larguras (w-auto, w-44 etc.).
export function Select({ error = false, className = "", disabled, children, ...rest }: Props) {
  return (
    <div className={`relative ${className}`.trim()}>
      <select
        disabled={disabled}
        className={`c41-select w-full h-9 pl-3 pr-8 rounded-[10px] border bg-input-bg text-[length:var(--fs-input)] text-fg outline-none transition-colors appearance-none cursor-pointer ${
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
