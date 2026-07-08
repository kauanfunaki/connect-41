type Props = {
  label: string;
  color: string;
  className?: string;
};

// Acento de setor — SEMPRE chip pequeno com dot, nunca fundo inteiro de card/linha/tela.
export function SectorChip({ label, color, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-surface-hover border border-border text-fg-secondary text-[12.5px] font-medium px-2.5 py-1 rounded-full ${className}`.trim()}
    >
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}
