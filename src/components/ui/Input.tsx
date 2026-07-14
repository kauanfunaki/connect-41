"use client";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  error?: boolean;
  icon?: React.ReactNode;
  /** Texto fixo antes do valor, ex.: "R$" — renderiza célula separada por borda. */
  prefix?: string;
  /** Texto fixo depois do valor, ex.: "%" ou "kg". */
  suffix?: string;
};

export function Input({ error = false, icon, prefix, suffix, className = "", disabled, readOnly, ...rest }: Props) {
  // Variante com prefixo/sufixo: a borda e o focus ring vivem no wrapper
  // (focus-within), e o input interno fica transparente e sem borda.
  if (prefix || suffix) {
    return (
      <div
        className={`flex items-stretch w-full h-9 rounded-[10px] border bg-input-bg overflow-hidden transition-colors ${
          error
            ? "border-danger focus-within:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
            : "border-border-strong focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
        } has-[:disabled]:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      >
        {prefix && (
          <span className="flex items-center px-3 text-[length:var(--fs-helper)] text-fg-muted border-r border-border select-none whitespace-nowrap">
            {prefix}
          </span>
        )}
        <input
          disabled={disabled}
          readOnly={readOnly}
          className="flex-1 min-w-0 px-3 bg-transparent text-[length:var(--fs-input)] text-fg placeholder:text-fg-muted outline-none"
          {...rest}
        />
        {suffix && (
          <span className="flex items-center px-3 text-[length:var(--fs-helper)] text-fg-muted border-l border-border select-none whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
    );
  }

  const input = (
    <input
      disabled={disabled}
      readOnly={readOnly}
      className={`w-full h-9 ${icon ? "pl-9" : "px-3"} pr-3 rounded-[10px] border bg-input-bg text-[length:var(--fs-input)] text-fg placeholder:text-fg-muted outline-none transition-colors ${
        error
          ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
          : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      } ${readOnly ? "bg-transparent border-dashed" : ""} disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      {...rest}
    />
  );

  if (!icon) return input;

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted [&>svg]:w-4 [&>svg]:h-4 pointer-events-none">
        {icon}
      </span>
      {input}
    </div>
  );
}
