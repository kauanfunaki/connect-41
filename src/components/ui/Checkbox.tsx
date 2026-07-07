"use client";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: React.ReactNode;
};

// Wrapper do .c41-checkbox (globals.css) — nunca o quadrado nativo branco.
export function Checkbox({ label, className = "", id, ...rest }: Props) {
  const input = <input type="checkbox" id={id} className={`c41-checkbox ${className}`.trim()} {...rest} />;
  if (!label) return input;
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-[length:var(--fs-label)] text-fg-secondary cursor-pointer">
      {input}
      {label}
    </label>
  );
}
