"use client";

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
};

export function Select({ error = false, className = "", disabled, children, ...rest }: Props) {
  return (
    <select
      disabled={disabled}
      className={`w-full h-9 px-3 rounded-[10px] border bg-input-bg text-[length:var(--fs-input)] text-fg outline-none transition-colors appearance-none ${
        error
          ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
          : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      } disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      {...rest}
    >
      {children}
    </select>
  );
}
