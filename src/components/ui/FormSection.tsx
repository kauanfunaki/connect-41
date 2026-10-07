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
        {/* O rótulo em caixa alta do sistema (`.c41-rotulo`, 07/10/2026): era
            12px em cinza secundário e espaçamento largo, um desenho só daqui
            (antes, 12.5px — revisão de 30/09). */}
        <h4 className="c41-rotulo">{title}</h4>
        {descricao && <p className="mt-1 text-helper text-fg-secondary">{descricao}</p>}
      </div>
      {children}
    </div>
  );
}
