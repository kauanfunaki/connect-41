type Props = {
  title: string;
  /** Uma linha sobre o que a seção agrupa, embaixo do título. */
  descricao?: string;
  children: React.ReactNode;
};

export function FormSection({ title, descricao, children }: Props) {
  return (
    <div className="space-y-4 pb-5 mb-5 border-b border-border last:border-0 last:mb-0 last:pb-0">
      <div>
        {/* 12px: era 12.5px, fora da escala de tamanhos (revisão de 30/09). */}
        <h4 className="text-[length:var(--fs-2)] font-semibold text-fg-secondary uppercase tracking-wider">{title}</h4>
        {descricao && <p className="mt-1 text-[length:var(--fs-helper)] text-fg-secondary">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}
