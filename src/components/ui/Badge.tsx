type Variant = "success" | "warning" | "danger" | "info";

type Props = {
  variant: Variant;
  children: React.ReactNode;
  className?: string;
};

const VARIANT_CLASS: Record<Variant, string> = {
  success: "bg-success-bg text-success border-success/40",
  warning: "bg-warning-bg text-warning border-warning/40",
  danger: "bg-danger-bg text-danger border-danger/40",
  info: "bg-info-bg text-info border-info/40",
};

// Pílula pra categorias reais (não para "status ativo/inativo" — isso usa StatusDot).
export function Badge({ variant, children, className = "" }: Props) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[length:var(--fs-badge)] font-semibold border ${VARIANT_CLASS[variant]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
