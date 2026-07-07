type Props = {
  title: string;
  children: React.ReactNode;
};

export function FormSection({ title, children }: Props) {
  return (
    <div className="space-y-4 pb-5 mb-5 border-b border-border last:border-0 last:mb-0 last:pb-0">
      <h4 className="text-[12.5px] font-semibold text-fg-muted uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}
