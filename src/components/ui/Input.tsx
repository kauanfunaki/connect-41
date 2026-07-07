"use client";

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
  icon?: React.ReactNode;
};

export function Input({ error = false, icon, className = "", disabled, readOnly, ...rest }: Props) {
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
