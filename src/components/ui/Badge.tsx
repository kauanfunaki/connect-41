export type VarianteDoBadge = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  variant: VarianteDoBadge;
  children: React.ReactNode;
  className?: string;
};

// Verde e âmbar na letra pelo tom de letra (`-fg`, escolha 1A do Kauan,
// 08/10/2026); fundo e borda seguem no tom cheio.
const VARIANT_CLASS: Record<VarianteDoBadge, string> = {
  success: "bg-success-bg text-success-fg border-success/40",
  warning: "bg-warning-bg text-warning-fg border-warning/40",
  danger: "bg-danger-bg text-danger border-danger/40",
  info: "bg-info-bg text-info border-info/40",
  // O que saiu de cena — "Cancelada", "Inativa", "Encerrada", "Desligada"
  // (07/10/2026). Sem esta variante as telas usavam `info`, o mesmo azul de
  // "A vencer" na mesma coluna. As cores do `neutro` do Selo.
  neutral: "bg-surface-2 text-fg-muted border-border",
};

// Pílula para CATEGORIA em destaque: tipo, origem, setor, etiqueta de
// classificação. Pela regra por papel (escolha 2A do Kauan, 08/10/2026), a
// situação de uma linha ("Vencida", "Cancelada", "Em análise") é o `Selo`, e
// ativo/inativo de cadastro é a bolinha (`StatusDot`) — ver o comentário do
// `Selo`. Quem tem um mapa situação → variante passa a `Selo` com
// `tomDaVariante`, sem reescrever o mapa.
export function Badge({ variant, children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-[3px] leading-4 rounded-full text-badge font-semibold border ${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
