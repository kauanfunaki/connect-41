type Props = {
  label: string;
  color: string;
  className?: string;
  /**
   * Algo pequeno depois do nome, dentro do chip — o sinal da situação do setor
   * na lista de transferências (10/11/2026).
   */
  children?: React.ReactNode;
};

// Acento de setor — SEMPRE chip pequeno com dot, nunca fundo inteiro de card/linha/tela.
export function SectorChip({ label, color, className = "", children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-surface-hover border border-border text-fg-secondary text-fs-2 font-medium px-2.5 py-1 rounded-full ${className}`.trim()}
    >
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
      {children}
    </span>
  );
}
