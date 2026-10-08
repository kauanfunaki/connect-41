type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  /**
   * `erro` (07/10/2026): anel e disco no vermelho, para a tela de erro e a de
   * "não encontrado" falarem a mesma língua do vazio. Eram um cartão próprio,
   * com ícone quadrado de 40px e título de 14px.
   */
  tom?: "padrao" | "erro";
};

// Estado vazio: o ícone ganhou moldura (anel tracejado + disco na cor da
// marca) no polimento de 30/09 — solto e cinza, ele parecia erro de
// carregamento, e não "ainda não há nada aqui".
export function EmptyState({ title, description, action, icon, tom = "padrao" }: Props) {
  const erro = tom === "erro";
  return (
    <div className="py-14 px-6 flex flex-col items-center text-center">
      {icon && (
        <span className="relative mb-5 inline-flex size-20 items-center justify-center">
          <span aria-hidden className={`absolute inset-0 rounded-full border border-dashed ${erro ? "border-danger/40" : "border-border-strong"}`} />
          <span aria-hidden className={`absolute inset-3 rounded-full ${erro ? "bg-danger-bg" : "bg-brand-subtle"}`} />
          <span className={`relative ${erro ? "text-danger" : "text-brand"} [&>svg]:w-6 [&>svg]:h-6`}>{icon}</span>
        </span>
      )}
      <p className="font-display text-fs-6 font-semibold text-fg tracking-[-0.01em]">{title}</p>
      {description && (
        <p className="text-label text-fg-secondary max-w-[420px] mt-1.5 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
