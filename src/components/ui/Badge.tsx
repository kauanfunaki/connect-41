export type VarianteDoBadge = "success" | "warning" | "danger" | "info" | "neutral";

type Props = {
  variant: VarianteDoBadge;
  children: React.ReactNode;
  className?: string;
};

const VARIANT_CLASS: Record<VarianteDoBadge, string> = {
  success: "bg-success-bg text-success border-success/40",
  warning: "bg-warning-bg text-warning border-warning/40",
  danger: "bg-danger-bg text-danger border-danger/40",
  info: "bg-info-bg text-info border-info/40",
  // O que saiu de cena — "Cancelada", "Inativa", "Encerrada", "Desligada"
  // (07/10/2026). Sem esta variante as telas usavam `info`, o mesmo azul de
  // "A vencer" na mesma coluna. As cores do `neutro` do Selo.
  neutral: "bg-surface-2 text-fg-muted border-border",
};

// Pílula pra categorias reais (não para "status ativo/inativo" — isso usa StatusDot).
export function Badge({ variant, children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-[3px] leading-4 rounded-full text-badge font-semibold border ${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
