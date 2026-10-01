"use client";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: React.ReactNode;
};

// Wrapper do .c41-checkbox (globals.css) — nunca o quadrado nativo branco.
export function Checkbox({ label, className = "", id, ...rest }: Props) {
  const input = <input type="checkbox" id={id} className={`c41-checkbox ${className}`.trim()} {...rest} />;
  if (!label) return input;
  return (
    // A caixa acompanha a primeira linha do rótulo: com rótulo longo, centrada
    // ficava no meio do parágrafo (revisão de 30/09).
    <label htmlFor={id} className="inline-flex items-start gap-2 text-[length:var(--fs-label)] leading-5 text-fg-secondary cursor-pointer">
      <span className="flex h-5 flex-shrink-0 items-center">{input}</span>
      <span>{label}</span>
    </label>
  );
}
