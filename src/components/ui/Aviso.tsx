export type TomDoAviso = "perigo" | "atencao" | "sucesso" | "info" | "marca" | "neutro";

// Os tons seguem a receita que o app já escrevia à mão (07/10/2026): fundo a
// 8%, borda a 20% e o texto na cor do tom — `bg-danger/8 border-danger/20` em
// 49 lugares, `bg-success/8 border-success/20` em 14. As variantes de fundo
// `-bg` com borda /30 (outros 30 lugares) convergem para esta. No verde e no
// âmbar o texto usa o tom de letra (`-fg`, escolha 1A do Kauan, 08/10/2026).
const COR: Record<TomDoAviso, string> = {
  perigo: "text-danger bg-danger/8 border-danger/20",
  atencao: "text-warning-fg bg-warning/8 border-warning/20",
  sucesso: "text-success-fg bg-success/8 border-success/20",
  info: "text-info bg-info/8 border-info/20",
  marca: "text-brand bg-brand/8 border-brand/20",
  neutro: "text-fg-secondary bg-surface-2 border-border",
};

type Props = {
  tom?: TomDoAviso;
  /** Ícone opcional à esquerda, na cor do tom. */
  icone?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

/**
 * A caixa de aviso dentro de formulário, confirmação e tela (07/10/2026).
 *
 * Era escrita à mão 88 vezes só no tom de erro, com variações de alfa, raio e
 * tamanho (`/8` ou `/10`, `rounded-md` ou `rounded-lg`, 12 ou 13px), e mais 56
 * caixas de atenção, informação e sucesso. Um componente só, no desenho
 * dominante: 13px, `rounded-md`, `px-3 py-2`.
 *
 * O tom de perigo é anunciado pelo leitor de tela (`role="alert"`): é o erro
 * que volta de uma ação e aparece sem a pessoa ter navegado até ele. Os outros
 * tons são texto da tela, sem papel.
 */
export function Aviso({ tom = "perigo", icone, className = "", children }: Props) {
  return (
    <div
      role={tom === "perigo" ? "alert" : undefined}
      className={`${icone ? "flex items-start gap-2 " : ""}text-ui rounded-md border px-3 py-2 ${COR[tom]} ${className}`.trim()}
    >
      {icone && <span className="flex-shrink-0 mt-0.5 [&>svg]:w-4 [&>svg]:h-4">{icone}</span>}
      {icone ? <div className="min-w-0">{children}</div> : children}
    </div>
  );
}
