import Link from "next/link";

type Props = React.HTMLAttributes<HTMLElement> & {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
  /**
   * O cartão inteiro vira link (07/10/2026). Kanban, Espaços, Pastas,
   * Comunicados, Transferências e as listas do portal reescreviam o cartão
   * como `<Link>`, com três hovers diferentes — e em Transferências o link
   * ficava dentro do `p-4`, com a margem sem clique. O hover é o do cartão
   * atalho que a `FaixaDeTotais` e o `MetricCard` já usam: borda azul, sobe
   * 2px, sombra média.
   */
  href?: string;
};

const BASE = "bg-surface border border-border rounded-lg shadow-xs";

// Repassa atributos nativos (onClick, id, data-*, style…) — sem isso, os
// blocos ad-hoc `bg-surface border rounded-lg` espalhados pelo app não dariam
// pra migrar pra este componente sem perder comportamento silenciosamente. A
// exceção é `ref`: painéis de diálogo (Modal/SlideOver/ConfirmDialog)
// precisam dele pro focus trap, e isso pediria forwardRef aqui — não vale a
// complexidade num componente usado em 200+ lugares por causa de poucos
// casos; esses continuam como <div> cru.
export function Card({ children, className = "", as: As = "div", href, ...rest }: Props) {
  if (href) {
    return (
      <Link
        href={href}
        className={`block ${BASE} transition-[border-color,box-shadow,transform] duration-150 hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-md ${className}`.trim()}
        {...(rest as React.HTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Link>
    );
  }
  return (
    <As className={`${BASE} ${className}`.trim()} {...rest}>
      {children}
    </As>
  );
}
