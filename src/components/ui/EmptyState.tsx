type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
};

export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="py-16 px-6 flex flex-col items-center text-center gap-2">
      {icon && <span className="text-fg-muted mb-1 [&>svg]:w-8 [&>svg]:h-8">{icon}</span>}
      <p className="text-[length:var(--fs-body)] font-semibold text-fg">{title}</p>
      {description && <p className="text-[length:var(--fs-helper)] text-fg-muted max-w-[360px]">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
