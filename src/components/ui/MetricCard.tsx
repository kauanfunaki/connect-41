import Link from "next/link";

type Props = {
  label: string;
  value: number | string;
  /** Torna o card clicável. Sem href, vira um bloco estático. */
  href?: string;
  /** Ícone à esquerda do label — herda a cor de `highlight`. */
  icon?: React.ReactNode;
  /** Texto de apoio ao lado do valor, ex: "+3 este mês", "2 vencidos". */
  sub?: string;
  /** Pinta valor e ícone de `warning` — para métrica que pede atenção. */
  highlight?: boolean;
  /** Atraso do stagger de entrada, em ms. */
  delay?: number;
};

// Card de métrica de Home/dashboards: label curto + número grande.
//
// Esta é a versão que nasceu como `StatCard` dentro de home/page.tsx e evoluiu
// lá (ganhou ícone e sublinha) enquanto o MetricCard original da biblioteca
// ficava sem consumidor nenhum. Consolidados num só: `icon`, `sub` e `href`
// são opcionais, então ele cobre tanto o card da Home quanto o caso simples.
export function MetricCard({ label, value, href, icon, sub, highlight = false, delay = 0 }: Props) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={`inline-flex w-7 h-7 rounded-lg items-center justify-center flex-shrink-0 ${
              highlight ? "bg-warning/10 text-warning" : "bg-brand-subtle text-brand"
            }`}
          >
            {icon}
          </span>
        )}
        <p className="text-[length:var(--fs-helper)] text-fg-muted truncate">{label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <p
          className={`font-display text-[length:var(--fs-metric)] font-semibold tnum leading-none ${
            highlight ? "text-warning" : "text-fg"
          }`}
        >
          {value}
        </p>
        {sub && <span className="text-[length:var(--fs-micro)] text-fg-muted truncate">{sub}</span>}
      </div>
    </>
  );

  const cls =
    "reveal-in bg-surface border border-border rounded-lg px-4 py-3.5 flex flex-col gap-2 transition-[border-color,transform]";

  if (href) {
    return (
      <Link
        href={href}
        style={{ animationDelay: `${delay}ms` }}
        className={`${cls} hover:border-border-strong hover:-translate-y-0.5`}
      >
        {content}
      </Link>
    );
  }
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={cls}>
      {content}
    </div>
  );
}
