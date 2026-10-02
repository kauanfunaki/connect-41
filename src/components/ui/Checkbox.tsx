"use client";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: React.ReactNode;
  /** Explicação curta embaixo do rótulo, alinhada ao texto dele (e não à
   *  caixa) — as telas montavam um <p> à parte, começando na borda da caixa. */
  helper?: React.ReactNode;
};

export function Checkbox({ label, helper, className = "", id, ...rest }: Props) {
  const input = <input type="checkbox" id={id} className={`c41-checkbox ${className}`.trim()} {...rest} />;
  if (!label) return input;
  const rotulo = (
    <label htmlFor={id} className="inline-flex items-start gap-2 text-[length:var(--fs-label)] leading-5 text-fg-secondary cursor-pointer">
      <span className="flex h-5 flex-shrink-0 items-center">{input}</span>
      <span>{label}</span>
    </label>
  );
  if (!helper) return rotulo;
  // 26px = a caixa (18px) + o espaço até o texto (gap-2).
  return (
    <div className="flex flex-col gap-0.5">
      {rotulo}
      <p className="pl-[26px] text-[length:var(--fs-helper)] text-fg-muted leading-snug">{helper}</p>
    </div>
  );
}
