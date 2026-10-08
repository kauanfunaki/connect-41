import Link from "next/link";
import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

/**
 * A situação que o número carrega, nos nomes dos gráficos (`shared/Graficos`):
 * crítico (vencido, estourado), atenção (vence logo), ok (em dia) e neutro
 * (sem situação — o zero, o que não se compara).
 */
export type TomDaMetrica = "critico" | "atencao" | "ok" | "neutro";

type Props = {
  label: string;
  /** Número sai em pt-BR (1.234); texto (dinheiro, horas) sai como veio. */
  value: number | string;
  /** Torna o card clicável. Sem href, vira um bloco estático. */
  href?: string;
  /** Ícone à esquerda do label — herda a cor do tom. */
  icon?: React.ReactNode;
  /** Texto de apoio ao lado do valor, ex: "+3 este mês", "2 vencidos". */
  sub?: string;
  /** Algo pequeno ao lado do valor — o selo de tendência. */
  comparacao?: React.ReactNode;
  /**
   * Pinta valor e ícone pela situação (07/10/2026). Sem ícone próprio, os tons
   * crítico, atenção e ok ganham o deles (octógono, triângulo, visto), para a
   * situação não depender só da cor. Sem `tom`, o cartão é o de sempre: ícone
   * azul e valor no texto normal.
   */
  tom?: TomDaMetrica;
  /** O `tom="atencao"` de antes, sem o ícone automático. Prefira `tom`. */
  highlight?: boolean;
  /** Atraso do stagger de entrada, em ms. */
  delay?: number;
};

const COR_DO_TOM: Record<TomDaMetrica, { selo: string; valor: string }> = {
  critico: { selo: "bg-danger/10 text-danger", valor: "text-danger" },
  atencao: { selo: "bg-warning/10 text-warning-fg", valor: "text-warning-fg" },
  ok: { selo: "bg-success/10 text-success-fg", valor: "text-success-fg" },
  neutro: { selo: "bg-surface-2 text-fg-muted", valor: "text-fg-muted" },
};
const PADRAO = { selo: "bg-brand-subtle text-brand", valor: "text-fg" };

function iconeDoTom(tom: TomDaMetrica | undefined): React.ReactNode {
  if (tom === "critico") return <OctagonAlert size={15} aria-hidden />;
  if (tom === "atencao") return <TriangleAlert size={15} aria-hidden />;
  if (tom === "ok") return <CircleCheck size={15} aria-hidden />;
  return null;
}

const NUMERO = new Intl.NumberFormat("pt-BR");

// Card de métrica de Home/dashboards: label curto + número grande.
//
// Esta é a versão que nasceu como `StatCard` dentro de home/page.tsx e evoluiu
// lá (ganhou ícone e sublinha) enquanto o MetricCard original da biblioteca
// ficava sem consumidor nenhum. Consolidados num só: `icon`, `sub` e `href`
// são opcionais, então ele cobre tanto o card da Home quanto o caso simples.
export function MetricCard({ label, value, href, icon, sub, comparacao, tom, highlight = false, delay = 0 }: Props) {
  const tomEfetivo: TomDaMetrica | undefined = tom ?? (highlight ? "atencao" : undefined);
  const cores = tomEfetivo ? COR_DO_TOM[tomEfetivo] : PADRAO;
  const iconeFinal = icon ?? (tom ? iconeDoTom(tom) : null);
  const content = (
    <>
      <div className="flex items-center gap-2">
        {iconeFinal && (
          <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center flex-shrink-0 ${cores.selo}`}>
            {iconeFinal}
          </span>
        )}
        <p className="text-helper text-fg-secondary truncate c41-cortavel">{label}</p>
      </div>
      {/* `min-w-0` + `truncate`: um valor em reais passava da borda do cartão
          numa grade de quatro colunas (visto em Indicadores de RH, 30/09). O
          valor encolhe de 30 para 22px até `2xl`, como o da FaixaDeTotais, e o
          que ainda cortar ganha a dica. */}
      <div className="flex items-baseline gap-2 min-w-0">
        <p
          className={`font-display text-title 2xl:text-metric font-semibold tnum leading-none min-w-0 truncate c41-cortavel ${cores.valor}`}
        >
          {typeof value === "number" ? NUMERO.format(value) : value}
        </p>
        {comparacao}
        {sub && <span className="text-micro text-fg-muted truncate">{sub}</span>}
      </div>
    </>
  );

  const cls =
    "reveal-in min-w-0 bg-surface border border-border rounded-lg px-4 py-3.5 flex flex-col gap-2 shadow-xs transition-[border-color,box-shadow,transform] duration-150";

  if (href) {
    return (
      <Link
        href={href}
        style={{ animationDelay: `${delay}ms` }}
        className={`${cls} hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-md`}
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
