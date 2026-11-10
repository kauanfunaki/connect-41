import Link from "next/link";
import { LinkSemRecarregar } from "@/components/shared/NavegacaoSemRecarregar";
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
  /**
   * O cartão é um filtro da lista abaixo (os da `FaixaDeTotais` com `ativo`).
   * De 09/10 a 09/11/2026 era um `<a>` simples, que recarregava a página
   * inteira; agora navega sem recarregar e sem rolar a tela, como o
   * `FiltrosDaTela` (`NavegacaoSemRecarregar`).
   */
  filtro?: boolean;
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
  /**
   * O número principal da tela, num cartão cheio de azul com letra branca
   * (paleta B "Mais azul", 13/10/2026). Um por tela: quem decide é a
   * `FaixaDeTotais` (`indiceDoDestaque`). O tom não pinta o valor aqui.
   */
  destaque?: boolean;
  /**
   * O rótulo sempre inteiro: quebra linha em qualquer largura e nunca corta
   * com "…" (14/10/2026, "Desligamentos em setembro" nos Colaboradores de
   * clientes). O rótulo reserva sempre a altura de duas linhas (`2lh`, do
   * próprio leading), quebre ou não: assim o valor começa na mesma altura em
   * todos os cartões da faixa — no computador e no celular, no cartão azul
   * também. Sem ele, do `sm` em diante o rótulo fica numa linha e corta com a
   * dica.
   */
  rotuloInteiro?: boolean;
  /**
   * O que vai embaixo de tudo, na largura do cartão — a linha da tendência dos
   * cartões do topo do Início (10/11/2026).
   */
  rodape?: React.ReactNode;
  /**
   * Uma ação no canto de cima, fora do link do cartão (botão dentro de link
   * não é HTML válido) — o lápis dos cartões do Início (10/11/2026). O rótulo
   * reserva o espaço dela. O cartão ganha o grupo `group/cartao`, para a ação
   * aparecer ao passar o mouse.
   */
  canto?: React.ReactNode;
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
const DESTAQUE = { selo: "bg-on-brand/15 text-on-brand", valor: "text-on-brand" };

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
  destaque = false,
  filtro = false,
  rotuloInteiro = false,
  rodape,
  canto,
  delay = 0,
}: Props) {
  const tomEfetivo: TomDaMetrica | undefined = tom ?? (highlight ? "atencao" : undefined);
  const cores = destaque ? DESTAQUE : tomEfetivo ? COR_DO_TOM[tomEfetivo] : PADRAO;
  // Branco a 90% no rótulo e no detalhe: 4,7:1 no começo do degradê (brand-600).
  const corDoRotulo = destaque ? "text-on-brand/90" : "text-fg-secondary";
  const corDoApoio = destaque ? "text-on-brand/90" : "text-fg-muted";
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
        <p
          className={`min-w-0 text-helper leading-snug ${corDoRotulo} ${canto ? "pr-8" : ""} ${
            rotuloInteiro ? "min-h-[2lh] whitespace-normal break-words" : "truncate max-sm:whitespace-normal max-sm:line-clamp-2 c41-cortavel"
          }`}
        >
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
        {sub && <span className={`text-micro ${corDoApoio} truncate`}>{sub}</span>}
      </div>
      {/* Até duas linhas (09/11/2026): numa linha só, o detalhe comprido era
          cortado com "…" — no "Gasto no mês" das Certidões sumia o "mínimo de
          R$ 100,00 no mês", e a dica só aparecia passando o mouse. Na grade
          da faixa os cartões esticam juntos, então o valor de todos continua
          na mesma altura. */}
      {detalhe && <p className={`-mt-0.5 text-micro ${corDoApoio} line-clamp-2 break-words`}>{detalhe}</p>}
      {rodape}
    </>
  );

  // Destaque que também é o recorte ativo: o anel solto do cartão, porque o
  // fundo já é azul.
  const fundo = destaque
    ? `bg-[linear-gradient(135deg,var(--c41-destaque-numero-de),var(--c41-destaque-numero-ate))] border-transparent ${
        ativo ? "ring-2 ring-brand ring-offset-2 ring-offset-canvas" : ""
      }`
    : ativo
      ? "bg-brand-subtle border-brand ring-2 ring-brand"
      : "bg-surface border-border";
  // Com ação no canto, o cartão mora dentro de uma caixa que é o item da grade:
  // ele estica até a altura dela, para os cartões da faixa ficarem iguais.
  const cls = `reveal-in min-w-0 border rounded-lg px-4 py-3.5 flex flex-col gap-2 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ${canto ? "h-full" : ""} ${fundo}`;
  const atual = ativo ? ("true" as const) : undefined;

  // Sem anel de foco próprio: o `:focus-visible` global já desenha o dele.
  let cartao: React.ReactNode;
  if (href) {
    const Destino = filtro ? LinkSemRecarregar : Link;
    cartao = (
      <Destino
        href={href}
        aria-current={atual}
        style={{ animationDelay: `${delay}ms` }}
        className={`${cls} ${destaque ? "" : "hover:border-brand/40"} hover:-translate-y-0.5 hover:shadow-md`}
      >
        {content}
      </Destino>
    );
  } else {
    cartao = (
      <div aria-current={atual} style={{ animationDelay: `${delay}ms` }} className={cls}>
        {content}
      </div>
    );
  }
  if (!canto) return cartao;
  return (
    <div className="group/cartao relative min-w-0">
      {cartao}
      <div className="absolute top-2 right-2">{canto}</div>
    </div>
  );
}
