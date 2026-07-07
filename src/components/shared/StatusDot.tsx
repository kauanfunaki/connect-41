type Props = {
  color: string;
  label: string;
  className?: string;
};

// Padrão de status do Connect 41: ponto de cor + rótulo, sem pílula/fundo tintado
// (ver decisão de design registrada no projeto — "status por ponto + rótulo, não pílula").
export function StatusDot({ color, label, className = "" }: Props) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] text-fg-secondary ${className}`.trim()}>
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}
