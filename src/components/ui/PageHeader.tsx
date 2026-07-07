type Props = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex items-end justify-between mb-7 gap-4">
      <div>
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">{title}</h1>
        {subtitle && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
