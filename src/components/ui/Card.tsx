type Props = React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
};

// Repassa atributos nativos (onClick, id, data-*, style…) — sem isso, os
// blocos ad-hoc `bg-surface border rounded-lg` espalhados pelo app não dariam
// pra migrar pra este componente sem perder comportamento silenciosamente. A
// exceção é `ref`: painéis de diálogo (Modal/SlideOver/ConfirmDialog)
// precisam dele pro focus trap, e isso pediria forwardRef aqui — não vale a
// complexidade num componente usado em 200+ lugares por causa de poucos
// casos; esses continuam como <div> cru.
export function Card({ children, className = "", as: As = "div", ...rest }: Props) {
  return (
    <As className={`bg-surface border border-border rounded-lg ${className}`.trim()} {...rest}>
      {children}
    </As>
  );
}
