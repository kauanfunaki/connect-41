import Link from "next/link";
import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

/**
 * A situação que o número carrega, nos nomes dos gráficos (`shared/Graficos`):
 * crítico (vencido, estourado), atenção (vence logo), ok (em dia) e neutro
 * (sem situação — o zero, o que não se compara). `marca` é o número em azul que
 * chama sem ser alerta ("novas", "respondidas") — veio da `FaixaDeTotais`, que
 * pintava o valor com `text-brand` (08/10/2026).
 */
export type TomDaMetrica = "critico" | "atencao" | "ok" | "neutro" | "marca";

type Props = {
  label: string;
  /** Número sai em pt-BR (1.234); texto (dinheiro, horas) sai como veio. */
  value: number | string;
  /** Torna o card clicável. Sem href, vira um bloco estático. */
  href?: string;
  /** Filtros usam navegação completa para não reaproveitar uma árvore RSC de outro recorte. */
  navegacaoCompleta?: boolean;
  /** Ícone à esquerda do label — herda a cor do tom. */
  icon?: React.ReactNode;
  /** Texto de apoio ao lado do valor, ex: "+3 este mês", "2 vencidos". */
  sub?: string;
  /** Linha de apoio embaixo do valor (o `detalhe` da `FaixaDeTotais`). */
  detalhe?: string;
  /** Algo pequeno ao lado do valor — o selo de tendência. */
  comparacao?: React.ReactNode;
  /**
   * Pinta valor e ícone pela situação (07/10/2026). Sem ícone próprio, os tons
   * crítico, atenção e ok ganham o deles (octógono, triângulo, visto), para a
   * situação não depender só da cor. Sem `tom`, o cartão é o de sempre: ícone
   * azul e valor no texto normal.
   */
  tom?: TomDaMetrica;
  /**
   * `false` tira o ícone automático do tom: a `FaixaDeTotais` mostra só o
   * ícone que a tela deu, para os cartões de uma mesma faixa não saírem uns
   * com ícone e outros sem conforme a contagem.
   */
  iconeDoTom?: boolean;
  /** O `tom="atencao"` de antes, sem o ícone automático. Prefira `tom`. */
  highlight?: boolean;
  /**
   * O recorte que a lista abaixo está mostrando (07/10/2026, da `FaixaDeTotais`).
   * Ganha a borda e o fundo da marca e `aria-current`: antes só a frase
   * "mostrando agora" no detalhe dizia qual era.
   */
  ativo?: boolean;
  /** Atraso do stagger de entrada, em ms. */
  delay?: number;
};

// Verde e âmbar no tom de letra (`-fg`, escolha 1A do Kauan, 08/10/2026).
const COR_DO_TOM: Record<TomDaMetrica, { selo: string; valor: string }> = {
  critico: { selo: "bg-danger/10 text-danger", valor: "text-danger" },
  atencao: { selo: "bg-warning/10 text-warning-fg", valor: "text-warning-fg" },
  ok: { selo: "bg-success/10 text-success-fg", valor: "text-success-fg" },
  neutro: { selo: "bg-surface-2 text-fg-muted", valor: "text-fg-muted" },
  marca: { selo: "bg-brand-subtle text-brand", valor: "text-brand" },
};
const PADRAO = { selo: "bg-brand-subtle text-brand", valor: "text-fg" };

function iconeDoTom(tom: TomDaMetrica | undefined): React.ReactNode {
  if (tom === "critico") return <OctagonAlert size={15} aria-hidden />;
  if (tom === "atencao") return <TriangleAlert size={15} aria-hidden />;
  if (tom === "ok") return <CircleCheck size={15} aria-hidden />;
  return null;
}

const NUMERO = new Intl.NumberFormat("pt-BR");

/**
 * O cartão de número — o único desenho de total do Connect.
 *
 * Nasceu como `StatCard` dentro de home/page.tsx e evoluiu lá (ganhou ícone e
 * sublinha) enquanto o MetricCard original da biblioteca ficava sem consumidor
 * nenhum; os dois viraram este. Desde 08/10/2026 (escolha 6B do Kauan na
 * página de decisões: um cartão por número) é também o cartão que a
 * `FaixaDeTotais` desenha em cada item — antes ela tinha o desenho próprio,
 * com o ícone do outro lado do rótulo. Do desenho dela vieram o `detalhe`, o
 * `ativo` e o ajuste do celular abaixo.
 *
 * No celular (02/10/2026), dois cartões por linha deixam ~130px de texto: o
 * rótulo quebra em duas linhas em vez de cortar, o ícone sai e o valor diminui
 * um pouco — era "Aguardan…" e "R$ 33.82…" no portal. Do `sm` em diante, rótulo
 * numa linha com a dica do texto cortado.
 */
export function MetricCard({
  label,
  value,
  href,
  icon,
  sub,
  detalhe,
  comparacao,
  tom,
  iconeDoTom: comIconeDoTom = true,
  highlight = false,
  ativo = false,
  navegacaoCompleta = false,
  delay = 0,
}: Props) {
  const tomEfetivo: TomDaMetrica | undefined = tom ?? (highlight ? "atencao" : undefined);
  const cores = tomEfetivo ? COR_DO_TOM[tomEfetivo] : PADRAO;
  const iconeFinal = icon ?? (tom && comIconeDoTom ? iconeDoTom(tom) : null);
  const content = (
    <>
      <div className="flex items-center gap-2 min-w-0">
        {iconeFinal && (
          <span
            className={`hidden sm:inline-flex w-7 h-7 rounded-lg items-center justify-center flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${cores.selo}`}
          >
            {iconeFinal}
          </span>
        )}
        <p className="min-w-0 text-helper leading-snug text-fg-secondary truncate max-sm:whitespace-normal max-sm:line-clamp-2 c41-cortavel">
          {label}
        </p>
      </div>
      {/* `min-w-0` + `truncate`: um valor em reais passava da borda do cartão
          numa grade de quatro colunas (visto em Indicadores de RH, 30/09). O
          valor encolhe de 30 para 22px até `2xl`, e no celular para 17-20px;
          o que ainda cortar ganha a dica. */}
      <div className="flex items-baseline gap-2 min-w-0">
        <p
          className={`font-display text-[clamp(1.0625rem,4.6vw,1.25rem)] sm:text-title 2xl:text-metric font-semibold tnum leading-none min-w-0 truncate c41-cortavel ${cores.valor}`}
        >
          {typeof value === "number" ? NUMERO.format(value) : value}
        </p>
        {comparacao}
        {sub && <span className="text-micro text-fg-muted truncate">{sub}</span>}
      </div>
      {detalhe && <p className="-mt-0.5 text-micro text-fg-muted truncate c41-cortavel">{detalhe}</p>}
    </>
  );

  const cls = `reveal-in min-w-0 border rounded-lg px-4 py-3.5 flex flex-col gap-2 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ${
    ativo ? "bg-brand-subtle border-brand ring-2 ring-brand" : "bg-surface border-border"
  }`;
  const atual = ativo ? ("true" as const) : undefined;

  // Sem anel de foco próprio: o `:focus-visible` global já desenha o dele.
  if (href) {
    const Destino = navegacaoCompleta ? "a" : Link;
    return (
      <Destino
        href={href}
        aria-current={atual}
        style={{ animationDelay: `${delay}ms` }}
        className={`${cls} hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-md`}
      >
        {content}
      </Destino>
    );
  }
  return (
    <div aria-current={atual} style={{ animationDelay: `${delay}ms` }} className={cls}>
      {content}
    </div>
  );
}
