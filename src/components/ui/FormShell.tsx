type Props = {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
};

// Casco padrão de formulário: header opcional + corpo (FormSection*) + barra
// de ações fixa no rodapé (sticky-actions da spec).
export function FormShell({ title, subtitle, children, actions }: Props) {
  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {title && (
        <div className="px-6 py-5 border-b border-border">
          <h3 className="font-display text-[length:var(--fs-section)] font-semibold text-fg">{title}</h3>
          {subtitle && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">{subtitle}</p>}
        </div>
      )}
      <div className="px-6 py-5">{children}</div>
      {actions && (
        <div className="sticky bottom-0 flex justify-end gap-2.5 px-6 py-4 bg-surface border-t border-border">
          {actions}
        </div>
      )}
    </div>
  );
}
