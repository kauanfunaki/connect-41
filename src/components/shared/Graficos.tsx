import Link from "next/link";
import { ArrowUpRight, CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Selo, Tendencia, TomDaTendencia } from "@/lib/home/tendencia";

// Gráficos dos painéis da Home (30/09) — a leitura "Power BI" que o Kauan
// trouxe do HubStrom, no vocabulário do Perímetro. Server components puros:
// SVG/HTML sem lib de gráfico, dica pelo `DicaFlutuante` (`data-dica`) e
// clique que leva para a lista já filtrada, quando existe uma.
//
// Regras seguidas (método de dataviz):
// - cor de situação é reservada e sempre vem com ícone + rótulo na legenda;
// - número em texto neutro, nunca na cor da série;
// - cada gráfico leva uma tabela `sr-only` com os mesmos números;
// - a dica (só com o mouse) não é o único lugar de um número: o que ela diz
//   também está escrito na legenda ou na tabela acessível (07/10).
// Paleta validada (claro e escuro) com o validador do método: crítico,
// atenção e "próximo" passam na separação para daltonismo; o cinza neutro é
// o "sem situação" de propósito. O "ok" passou a passar também em 08/10,
// com o verde mais claro da área do gráfico (ver `VERDE_DA_AREA`).
//
// Cor e volume (06/10, opção B escolhida pelo Kauan — achou os gráficos
// bons, mas apagados): o mesmo conteúdo com mais presença, em todas as telas
// que usam estes componentes. Topo do cartão tingido na cor do setor, filete
// de 4px, número principal em Space Grotesk; barras de 18px com 3px de vão e
// cada segmento arredondado; rosca mais grossa; colunas em degradê com o
// valor em cima de cada uma; sombra mais funda.

export type Tom = "critico" | "atencao" | "ok" | "proximo" | "neutro";

/** A cor da situação em texto e ícone: o número do painel e o ícone da legenda. */
const COR_DO_TOM: Record<Tom, string> = {
  critico: "var(--c41-danger)",
  atencao: "var(--c41-warning)",
  ok: "var(--c41-success)",
  proximo: "var(--c41-grafico-proximo)",
  neutro: "var(--c41-grafico-neutro)",
};

/**
 * "Em dia" na área do gráfico — fatia, segmento de barra — num verde mais
 * claro (escolha do Kauan na página de decisões, 08/10/2026 — 8A). Com o
 * verde dos selos, "ok" e "crítico" quase não se separavam para quem tem
 * daltonismo vermelho-verde: ΔE 3,8 no claro e 6,9 no escuro (OKLab ×100,
 * simulação Machado, o validador do método de dataviz). Mais claro, o estado
 * sem ação recua e o vermelho fica sendo a marca mais escura, a que chama o
 * olho. Só aqui: selos, textos, o número do painel e o ícone da legenda
 * continuam no `--c41-success`.
 *
 * Sem token novo no `globals.css`, derivado dos que existem: metade do verde
 * do tema com o verde do tema escuro (o mesmo matiz, mais claro — no escuro
 * os dois são o mesmo) e 10% de branco. Clarear só com branco não serve: o
 * verde perde croma e encosta no cinza de "sem previsão", que fica ao lado
 * dele na barra dos Processos.
 *
 * Medido contra crítico, atenção e neutro, em todos os pares:
 * - claro (#4EBB86 sobre #FFFFFF): daltonismo ΔE ≥ 8,3 (era 3,8 contra o
 *   crítico); visão normal ≥ 16,1; contraste 2,39:1 com o cartão (era 3,59).
 *   Abaixo de 3:1, como o âmbar de status do método: a separação vem do vão
 *   de 3px entre as fatias, do ícone e do rótulo na legenda e da tabela
 *   `sr-only` — que todo gráfico daqui já tem.
 * - escuro (#5CD19A sobre #1C1A22): daltonismo ΔE ≥ 9,3 contra o crítico
 *   (era 6,9); contraste 9,05:1.
 */
const VERDE_DA_AREA = "color-mix(in oklab, color-mix(in oklab, var(--c41-success) 50%, var(--c41-success-dark)) 90%, white)";

/** A cor da marca do gráfico (barra, fatia). Difere da `COR_DO_TOM` só no "ok". */
const COR_DA_AREA: Record<Tom, string> = { ...COR_DO_TOM, ok: VERDE_DA_AREA };

export type Segmento = {
  chave: string;
  rotulo: string;
  valor: number;
  tom: Tom;
  /** Leva para a lista já filtrada por esta fatia. */
  href?: string;
  /**
   * O valor que acompanha a contagem — ex.: o total em reais da fatia. Vai na
   * dica, na legenda (ao lado da contagem) e na tabela acessível.
   */
  detalhe?: string;
};

const NUMERO = new Intl.NumberFormat("pt-BR");
const NUMERO_CURTO = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export function numero(n: number): string {
  return NUMERO.format(n);
}

/** "12 mil", "1,2 mi" — o rótulo em cima da coluna; o valor exato fica na dica. */
export function numeroCurto(n: number): string {
  return NUMERO_CURTO.format(n);
}

function dicaDe(s: Segmento, total: number): string {
  const parte = total > 0 ? ` (${PCT.format(s.valor / total)})` : "";
  return `${s.rotulo}: ${numero(s.valor)}${parte}${s.detalhe ? `\n${s.detalhe}` : ""}`;
}

/** A contagem e, quando há, o valor que a acompanha — o texto da tabela acessível e do rótulo da fatia. */
function valorFalado(s: Segmento): string {
  return s.detalhe ? `${numero(s.valor)} (${s.detalhe})` : numero(s.valor);
}

// Gráfico mais baixo (06/10): com a faixa de destaques em cima, a grade dos
// painéis leva `data-compacto` (grupo `grade`, na Home) e a rosca e as
// colunas encolhem — o número que manda já está na faixa. O mesmo quando o
// painel ganha a linha da tendência (grupo `painel`): o gráfico de situação
// fica menor, embaixo dela.
const COMPACTO_ROSCA = "group-data-[compacto=true]/grade:size-[112px] group-data-[compacto=true]/painel:size-[112px]";
const COMPACTO_COLUNAS = "group-data-[compacto=true]/grade:h-28 group-data-[compacto=true]/painel:h-28";

// ─── Tendência ─────────────────────────────────────────────────────────────

const COR_DO_SELO: Record<TomDaTendencia, string> = {
  ruim: "bg-danger-bg text-danger",
  bom: "bg-success-bg text-success-fg",
  neutro: "bg-surface-hover text-fg-secondary",
};

/**
 * O selo da tendência (06/10, opção A): "▲ 12% em 7 dias", vermelho quando
 * piorou e verde quando melhorou — o sentido vem da métrica (subir em
 * "vencidas" é ruim). A seta e o texto dizem o mesmo que a cor.
 */
export function SeloDaTendencia({ selo }: { selo: Selo }) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-full text-[12px] font-semibold tnum whitespace-nowrap ${COR_DO_SELO[selo.tom]}`}
      data-dica={selo.descricao}
    >
      <span aria-hidden className="text-[10px]">
        {selo.seta}
      </span>
      <span aria-hidden>{selo.texto}</span>
      <span className="sr-only">{selo.descricao}</span>
    </span>
  );
}

/**
 * A linha das últimas semanas: área em degradê suave, traço e um ponto no
 * valor de hoje. Os pontos chegam normalizados (x e y de 0 a 1). O SVG estica
 * na largura (`preserveAspectRatio="none"`), então a área é um recorte em CSS
 * e o ponto é um elemento à parte — num SVG esticado o círculo viraria elipse.
 * Decorativa: o que ela diz está no selo e no número.
 */
export function Sparkline({
  pontos,
  cor = "var(--c41-brand)",
  variante = "painel",
  className = "",
}: {
  pontos: readonly { x: number; y: number }[];
  cor?: string;
  /** "faixa": branca translúcida, para o cartão cheio da faixa de destaques. */
  variante?: "painel" | "faixa";
  className?: string;
}) {
  if (pontos.length < 2) return null;
  // Margem para o traço e o ponto não encostarem na borda.
  const y = (v: number) => 0.14 + (1 - v) * 0.72;
  const traco = variante === "faixa" ? "rgb(255 255 255 / .75)" : cor;
  const area =
    variante === "faixa"
      ? "linear-gradient(to bottom, rgb(255 255 255 / .22), rgb(255 255 255 / 0))"
      : `linear-gradient(to bottom, color-mix(in srgb, ${cor} 24%, transparent), transparent)`;
  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * 100).toFixed(2)},${(y(p.y) * 100).toFixed(2)}`).join(" ");
  const recorte = `polygon(${pontos.map((p) => `${(p.x * 100).toFixed(2)}% ${(y(p.y) * 100).toFixed(2)}%`).join(", ")}, 100% 100%, 0% 100%)`;
  const ultimo = pontos[pontos.length - 1];

  return (
    <div className={`relative ${className}`} aria-hidden>
      <div className="absolute inset-0" style={{ clipPath: recorte, background: area }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        <path d={caminho} fill="none" stroke={traco} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className={`absolute size-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${variante === "faixa" ? "bg-white" : "ring-2 ring-surface"}`}
        style={{ left: `${ultimo.x * 100}%`, top: `${y(ultimo.y) * 100}%`, background: variante === "faixa" ? undefined : cor }}
      />
    </div>
  );
}

/** Ícone da situação — o que faz a cor não ser o único canal. */
function IconeDoTom({ tom }: { tom: Tom }) {
  const cls = "size-3.5 flex-shrink-0";
  const style = { color: COR_DO_TOM[tom] };
  if (tom === "critico") return <OctagonAlert className={cls} style={style} aria-hidden />;
  if (tom === "atencao") return <TriangleAlert className={cls} style={style} aria-hidden />;
  if (tom === "ok") return <CircleCheck className={cls} style={style} aria-hidden />;
  return <span className="size-2.5 mx-0.5 rounded-[3px] flex-shrink-0" style={{ background: COR_DO_TOM[tom] }} aria-hidden />;
}

// ─── Painel ────────────────────────────────────────────────────────────────

/**
 * O cartão de um painel: de que setor é, o que mostra, o número que manda e
 * o gráfico. "Abrir" leva para a tela de onde os números saem.
 */
export function Painel({
  setor,
  cor,
  titulo,
  href,
  destaque,
  children,
  rodape,
}: {
  /** Nome do setor (ou "Você", no painel pessoal). */
  setor: string;
  cor?: string;
  titulo: string;
  href?: string;
  /**
   * O número principal e o que ele é. Com `tendencia` (opção A, 06/10), ganha
   * o selo ao lado e a linha das últimas semanas embaixo; sem histórico, fica
   * como antes — sem selo, sem linha e sem espaço guardado para eles.
   */
  destaque?: { valor: string; legenda: string; tom?: Tom; tendencia?: Tendencia | null };
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const corDoSetor = cor ?? "var(--c41-brand)";
  const selo = destaque?.tendencia?.selo ?? null;
  const linha = destaque?.tendencia?.linha ?? null;
  const numeroPrincipal = destaque && (
    <span
      className="min-w-0 max-w-full font-display text-[length:var(--fs-metric)] font-bold leading-none tracking-tight tnum truncate c41-cortavel"
      style={destaque.tom && destaque.tom !== "neutro" ? { color: COR_DO_TOM[destaque.tom] } : undefined}
    >
      {destaque.valor}
    </span>
  );
  return (
    <section
      data-compacto={linha ? "true" : undefined}
      className="reveal-in group/painel relative min-w-0 flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-md)] p-5 overflow-hidden"
      // O topo tingido na cor do setor (06/10): 11% dela sobre a superfície,
      // sumindo antes do gráfico — dá identidade sem pintar o dado.
      style={{
        backgroundImage: `linear-gradient(to bottom, color-mix(in srgb, ${corDoSetor} 11%, var(--c41-surface)), var(--c41-surface) 128px)`,
      }}
    >
      {/* Filete na cor do setor: identifica o painel sem pintar o gráfico. */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: corDoSetor }} aria-hidden />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            <span className="size-1.5 rounded-full" style={{ background: corDoSetor }} aria-hidden />
            {setor}
          </p>
          <h2 className="font-display text-[length:var(--fs-section)] font-semibold text-fg leading-tight mt-1">{titulo}</h2>
        </div>
        {href && (
          <Link
            href={href}
            className="inline-flex items-center gap-1 h-7 px-2.5 -mr-1.5 rounded-md text-[12px] font-medium text-fg-secondary hover:text-brand hover:bg-brand-subtle transition-colors flex-shrink-0"
          >
            Abrir <ArrowUpRight size={13} />
          </Link>
        )}
      </header>

      {destaque &&
        (selo ? (
          // Com selo, ele vai ao lado do número e a legenda desce uma linha —
          // os três na mesma linha não cabem num painel de meia tela.
          <div className="mt-3 min-w-0">
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 min-w-0">
              {numeroPrincipal}
              <SeloDaTendencia selo={selo} />
            </p>
            <p className="mt-1.5 text-[length:var(--fs-helper)] text-fg-muted truncate">{destaque.legenda}</p>
          </div>
        ) : (
          <p className="mt-3 flex items-baseline gap-2 min-w-0">
            {numeroPrincipal}
            <span className="text-[length:var(--fs-helper)] text-fg-muted truncate">{destaque.legenda}</span>
          </p>
        ))}
      {/* Na cor da série (o azul), não na do setor: o vermelho do Fiscal ou o
          âmbar do BPO numa linha leriam como alerta. */}
      {linha && <Sparkline pontos={linha} className="mt-3 h-11" />}

      <div className="mt-4 flex-1 min-w-0">{children}</div>
      {rodape && <div className="mt-4 pt-3 border-t border-border text-[length:var(--fs-helper)] text-fg-muted">{rodape}</div>}
    </section>
  );
}

// ─── Barra de situação ─────────────────────────────────────────────────────

/**
 * A barra empilhada em si (sem legenda) — usada sozinha e nas linhas. 18px
 * de altura, 3px de vão e cada segmento com os cantos arredondados (06/10).
 */
function Pilha({ segmentos, largura = 100 }: { segmentos: Segmento[]; largura?: number }) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const visiveis = segmentos.filter((s) => s.valor > 0);
  return (
    <div className="group/pilha flex h-[26px] items-center gap-[3px]" style={{ width: `${largura}%` }}>
      {visiveis.map((s) => {
        const barra = (
          <span
            className="block h-[18px] w-full rounded-[5px] transition-opacity duration-150 group-hover/pilha:opacity-45 group-hover/seg:opacity-100!"
            style={{ background: COR_DA_AREA[s.tom] }}
          />
        );
        const comum = {
          className: "group/seg flex h-full items-center min-w-[6px]",
          style: { flexGrow: s.valor, flexBasis: 0 },
          "data-dica": dicaDe(s, total),
          "data-dica-rapida": "",
        };
        return s.href ? (
          <Link key={s.chave} href={s.href} aria-label={`${s.rotulo}: ${valorFalado(s)}`} {...comum}>
            {barra}
          </Link>
        ) : (
          <span key={s.chave} {...comum}>
            {barra}
          </span>
        );
      })}
    </div>
  );
}

/**
 * A legenda com os números. O `detalhe` (o R$ da faixa) fica escrito ao lado
 * da contagem (07/10, auditoria dos gráficos): só na dica, ele não chegava a
 * quem usa teclado ou toque — a dica abre com o mouse —, nem ao leitor de tela.
 * Fatia zerada não repete "R$ 0,00".
 */
function Legenda({ segmentos, comValores = true }: { segmentos: Segmento[]; comValores?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {segmentos.map((s) => {
        const conteudo = (
          <>
            <IconeDoTom tom={s.tom} />
            <span className="text-fg-secondary">{s.rotulo}</span>
            {comValores && <span className="text-fg font-medium tnum">{numero(s.valor)}</span>}
            {comValores && s.detalhe && s.valor > 0 && <span className="text-fg-secondary tnum">· {s.detalhe}</span>}
          </>
        );
        return (
          <li key={s.chave} className="text-[12px]">
            {s.href && comValores ? (
              <Link href={s.href} className="inline-flex items-center gap-1.5 rounded-sm hover:underline underline-offset-2 decoration-border-strong">
                {conteudo}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1.5">{conteudo}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function TabelaOculta({ titulo, linhas }: { titulo: string; linhas: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <tbody>
        {linhas.map(([a, b]) => (
          <tr key={a}>
            <th scope="row">{a}</th>
            <td>{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Uma barra 100% dividida por situação (vencidas · hoje · adiante…), com a
 * legenda embaixo carregando os números. Serve para "como está a carteira".
 */
export function BarraDeSituacao({
  titulo,
  segmentos,
  vazio = "Nada por aqui.",
}: {
  /** Nome curto do que a barra mede — acima dela e na tabela acessível. */
  titulo?: string;
  segmentos: Segmento[];
  vazio?: string;
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  return (
    <div className="min-w-0">
      {titulo && (
        <p className="flex items-baseline justify-between gap-2 text-[12px] mb-0.5">
          <span className="font-medium text-fg-secondary">{titulo}</span>
          <span className="text-fg-muted tnum">{numero(total)}</span>
        </p>
      )}
      {total === 0 ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>
      ) : (
        <>
          <Pilha segmentos={segmentos} />
          <div className="mt-1.5">
            <Legenda segmentos={segmentos} />
          </div>
        </>
      )}
      <TabelaOculta titulo={titulo ?? "Situação"} linhas={segmentos.map((s) => [s.rotulo, valorFalado(s)])} />
    </div>
  );
}

export type LinhaDeSituacao = {
  chave: string;
  rotulo: string;
  sublabel?: string;
  href?: string;
  segmentos: Segmento[];
};

/**
 * Várias barras empilhadas, uma por categoria (tipo de processo, vaga…): o
 * comprimento é o volume da categoria, as cores dizem a situação dentro dela.
 * Legenda única no topo, com os totais por situação.
 */
export function LinhasDeSituacao({
  titulo,
  linhas,
  vazio = "Nada por aqui.",
  restantes,
}: {
  titulo: string;
  linhas: LinhaDeSituacao[];
  vazio?: string;
  /** Quantas categorias ficaram de fora do recorte (ex.: "top 5"). */
  restantes?: number;
}) {
  const totais = new Map<string, Segmento>();
  for (const l of linhas) {
    for (const s of l.segmentos) {
      const prev = totais.get(s.chave);
      totais.set(s.chave, { ...s, href: undefined, valor: (prev?.valor ?? 0) + s.valor });
    }
  }
  const legenda = Array.from(totais.values());
  const maior = Math.max(1, ...linhas.map((l) => l.segmentos.reduce((s, x) => s + x.valor, 0)));

  if (linhas.length === 0) {
    return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>;
  }

  return (
    <div className="min-w-0">
      <Legenda segmentos={legenda} comValores={false} />
      <div className="mt-3 space-y-1.5">
        {linhas.map((l) => {
          const total = l.segmentos.reduce((s, x) => s + x.valor, 0);
          const rotulo = (
            <>
              <span className="block text-[12px] text-fg-secondary truncate">{l.rotulo}</span>
              {l.sublabel && <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate">{l.sublabel}</span>}
            </>
          );
          return (
            <div key={l.chave} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-3">
              {l.href ? (
                <Link href={l.href} className="min-w-0 hover:[&>span:first-child]:text-brand" data-dica={l.rotulo}>
                  {rotulo}
                </Link>
              ) : (
                <span className="min-w-0" data-dica={l.rotulo}>
                  {rotulo}
                </span>
              )}
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <Pilha segmentos={l.segmentos} largura={(total / maior) * 100} />
                </div>
                <span className="w-8 text-right text-[12px] font-medium text-fg tnum flex-shrink-0">{numero(total)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {restantes !== undefined && restantes > 0 && (
        <p className="text-[length:var(--fs-micro)] text-fg-muted mt-2">
          + {restantes} {restantes === 1 ? "outra categoria" : "outras categorias"} com menos itens
        </p>
      )}
      <TabelaOculta
        titulo={titulo}
        linhas={linhas.map((l) => [l.rotulo, l.segmentos.map((s) => `${s.rotulo}: ${valorFalado(s)}`).join("; ")])}
      />
    </div>
  );
}

// ─── Rosca ─────────────────────────────────────────────────────────────────

/**
 * Rosca com o total no meio e a legenda ao lado. Só para parte-de-um-todo com
 * poucas fatias (até 5); acima disso é barra.
 */
export function Rosca({
  titulo,
  segmentos,
  legendaDoTotal,
  vazio = "Nada por aqui.",
}: {
  titulo: string;
  segmentos: Segmento[];
  /** O que o número do meio conta ("tarefas", "certificados"). */
  legendaDoTotal: string;
  vazio?: string;
}) {
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  if (total === 0) return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>;

  // Anel de 16 (era 11, 06/10): mais grosso, e o raio recua para o anel com
  // hover (18) ainda caber no viewBox de 100.
  const r = 41;
  const c = 2 * Math.PI * r;
  // ~3px de superfície entre as fatias (em unidades do viewBox de 100).
  const vao = segmentos.filter((s) => s.valor > 0).length > 1 ? 2.2 : 0;
  const fatias: (Segmento & { dash: number; offset: number })[] = [];
  let cursor = 0;
  for (const s of segmentos) {
    if (s.valor <= 0) continue;
    const arco = (s.valor / total) * c;
    fatias.push({ ...s, dash: Math.max(arco - vao, 0.8), offset: -cursor });
    cursor += arco;
  }

  return (
    <div className="flex items-center gap-5 flex-wrap min-w-0">
      <div className={`relative size-[132px] flex-shrink-0 ${COMPACTO_ROSCA}`}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--c41-surface-hover)" strokeWidth="16" />
          {fatias.map((f) => (
            <circle
              key={f.chave}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              // Em `style`, e não no atributo `stroke`: o verde da área é um
              // `color-mix()`, que é CSS — o atributo de apresentação do SVG
              // não garante a leitura de função de cor em todo navegador.
              style={{ stroke: COR_DA_AREA[f.tom] }}
              strokeWidth="16"
              strokeDasharray={`${f.dash} ${c - f.dash}`}
              strokeDashoffset={f.offset}
              className="transition-[stroke-width] duration-150 hover:[stroke-width:18]"
              data-dica={dicaDe(f, total)}
              data-dica-rapida=""
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="font-display text-[length:var(--fs-title)] font-bold text-fg leading-none tnum">{numero(total)}</span>
          <span className="text-[length:var(--fs-micro)] text-fg-muted mt-1">{legendaDoTotal}</span>
        </div>
      </div>
      <ul className="flex-1 min-w-[9rem] space-y-1.5">
        {segmentos.map((s) => {
          const conteudo = (
            <>
              <IconeDoTom tom={s.tom} />
              <span className="text-fg-secondary truncate">{s.rotulo}</span>
              <span className="ml-auto pl-2 text-fg font-medium tnum">{numero(s.valor)}</span>
              <span className="w-9 text-right text-fg-muted tnum">{PCT.format(s.valor / total)}</span>
            </>
          );
          return (
            <li key={s.chave} className="text-[12px]">
              {s.href ? (
                <Link href={s.href} className="flex items-center gap-1.5 rounded-sm -mx-1 px-1 py-0.5 hover:bg-surface-hover">
                  {conteudo}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 -mx-1 px-1 py-0.5">{conteudo}</span>
              )}
            </li>
          );
        })}
      </ul>
      <TabelaOculta titulo={titulo} linhas={segmentos.map((s) => [s.rotulo, valorFalado(s)])} />
    </div>
  );
}

// ─── Colunas ───────────────────────────────────────────────────────────────

export type Coluna = { chave: string; rotulo: string; valor: number; dica?: string; destaque?: boolean };

/**
 * Colunas de uma série só (ex.: a pagar por semana), em degradê, com o valor
 * curto em cima de cada uma ("12 mil", 06/10) — o exato fica na dica e na
 * tabela acessível.
 */
export function Colunas({
  titulo,
  colunas,
  formatar = numero,
  formatarCurto = numeroCurto,
  vazio = "Nada por aqui.",
}: {
  titulo: string;
  colunas: Coluna[];
  /** O valor exato, na dica e na tabela acessível. */
  formatar?: (n: number) => string;
  /** O rótulo em cima da coluna — curto para caber em seis colunas no celular. */
  formatarCurto?: (n: number) => string;
  vazio?: string;
}) {
  const maior = Math.max(0, ...colunas.map((c) => c.valor));
  if (maior === 0) return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>;

  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-fg-secondary mb-2">{titulo}</p>
      {/* O `pt-5` guarda o lugar do rótulo da coluna mais alta: a altura da
          coluna é percentual da área de baixo, e o rótulo sobe para o vão. */}
      <div className={`group/colunas relative flex items-end gap-[3px] h-36 pt-5 border-b border-border ${COMPACTO_COLUNAS}`}>
        {colunas.map((c) => {
          const altura = c.valor > 0 ? Math.max((c.valor / maior) * 100, 3) : 0;
          const [topo, base] = c.destaque
            ? ["var(--c41-grafico-coluna-destaque-topo)", "var(--c41-grafico-coluna-destaque-base)"]
            : ["var(--c41-grafico-coluna-topo)", "var(--c41-grafico-coluna-base)"];
          return (
            <div
              key={c.chave}
              className="group/col relative flex-1 h-full flex flex-col justify-end items-center min-w-0"
              data-dica={`${c.rotulo}: ${formatar(c.valor)}${c.dica ? `\n${c.dica}` : ""}`}
              data-dica-rapida=""
            >
              {c.valor > 0 && (
                <span
                  className={`shrink-0 text-[length:var(--fs-micro)] tnum mb-1 whitespace-nowrap ${
                    c.valor === maior || c.destaque ? "font-semibold text-fg" : "font-medium text-fg-secondary"
                  }`}
                >
                  {formatarCurto(c.valor)}
                </span>
              )}
              {/* `shrink-0`: sem ele a coluna mais alta encolhia para o rótulo
                  caber, e deixava de ser proporcional às outras. */}
              <span
                className="block shrink-0 w-full max-w-9 rounded-t-[6px] transition-opacity duration-150 group-hover/colunas:opacity-45 group-hover/col:opacity-100!"
                style={{ height: `${altura}%`, background: `linear-gradient(to bottom, ${topo}, ${base})` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {colunas.map((c) => (
          <span key={c.chave} className="flex-1 min-w-0 text-center text-[length:var(--fs-micro)] text-fg-muted truncate">
            {c.rotulo}
          </span>
        ))}
      </div>
      <TabelaOculta titulo={titulo} linhas={colunas.map((c) => [c.rotulo, c.dica ? `${formatar(c.valor)} (${c.dica})` : formatar(c.valor)])} />
    </div>
  );
}

// ─── Funil ─────────────────────────────────────────────────────────────────

export type Etapa = { chave: string; rotulo: string; valor: number; href?: string };

/**
 * Funil de etapas (candidaturas por fase): barras centradas, uma cor só, com
 * a passagem de uma etapa para a seguinte em percentual.
 *
 * Duas leituras, e as duas ditas (07/10): a barra é a parte do total (a maior
 * etapa — num funil, a primeira, que todos alcançaram); o percentual escrito
 * ao lado é a passagem da etapa anterior. A dica e a tabela acessível levam as
 * duas por extenso.
 */
export function Funil({ titulo, etapas, vazio = "Nada por aqui." }: { titulo: string; etapas: Etapa[]; vazio?: string }) {
  const maior = Math.max(0, ...etapas.map((e) => e.valor));
  if (maior === 0) return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>;

  const leituras = etapas.map((e, i) => {
    const anterior = i > 0 ? etapas[i - 1].valor : null;
    return {
      doTotal: `${PCT.format(e.valor / maior)} do total`,
      passagem: anterior && anterior > 0 ? PCT.format(e.valor / anterior) : null,
    };
  });

  return (
    <div className="group/funil min-w-0 space-y-1">
      {etapas.map((e, i) => {
        const { doTotal, passagem } = leituras[i];
        const conteudo = (
          <>
            <span className="text-[12px] text-fg-secondary truncate">{e.rotulo}</span>
            <span className="flex h-[26px] items-center justify-center min-w-0">
              {e.valor > 0 && (
                <span
                  className="block h-[18px] rounded-[5px] min-w-[6px] transition-opacity duration-150 group-hover/funil:opacity-45 group-hover/etapa:opacity-100!"
                  style={{
                    width: `${(e.valor / maior) * 100}%`,
                    background: "linear-gradient(to right, var(--c41-grafico-coluna-base), var(--c41-grafico-coluna-topo), var(--c41-grafico-coluna-base))",
                  }}
                />
              )}
            </span>
            <span className="text-right text-[12px] font-medium text-fg tnum">{numero(e.valor)}</span>
            <span className="text-right text-[length:var(--fs-micro)] text-fg-muted tnum">{passagem ?? ""}</span>
          </>
        );
        const cls = "group/etapa grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.5rem_2.25rem] items-center gap-2 rounded-sm";
        const dica = `${e.rotulo}: ${numero(e.valor)}\n${doTotal}${passagem ? `\n${passagem} da etapa anterior` : ""}`;
        return e.href ? (
          <Link key={e.chave} href={e.href} className={`${cls} hover:bg-surface-hover`} data-dica={dica} data-dica-rapida="">
            {conteudo}
          </Link>
        ) : (
          <div key={e.chave} className={cls} data-dica={dica} data-dica-rapida="">
            {conteudo}
          </div>
        );
      })}
      <TabelaOculta
        titulo={titulo}
        linhas={etapas.map((e, i) => {
          const { doTotal, passagem } = leituras[i];
          return [e.rotulo, `${numero(e.valor)} (${doTotal}${passagem ? `; ${passagem} da etapa anterior` : ""})`];
        })}
      />
    </div>
  );
}

// ─── Financeiro: valores em dinheiro (08/10/2026) ──────────────────────────
//
// Três tipos a mais para levar a família às telas do financeiro — escolha 9A
// do Kauan na página de decisões (08/10/2026): Fluxo de caixa e Análise de
// contas com os componentes da Home; na DRE, só os gráficos de apoio. Os três
// medem dinheiro, não contagem: o valor sai pelo `formatar` de quem chama (os
// de cima escrevem `numero()`, que num valor em centavos daria "123.456").
//
// Cor: o que entra (ou soma) no azul da coluna; o que sai (ou subtrai) dois
// degraus mais claro — os tokens da coluna em destaque, já validados nos dois
// temas. Nunca verde e vermelho, que são de situação. Valor zero não desenha
// barra nem pinta nada; negativo vai no tom do que sai.

const COR_DA_ENTRADA = "linear-gradient(to bottom, var(--c41-grafico-coluna-topo), var(--c41-grafico-coluna-base))";
const COR_DA_SAIDA = "linear-gradient(to bottom, var(--c41-grafico-coluna-destaque-topo), var(--c41-grafico-coluna-destaque-base))";
const COR_DO_TOTAL = "var(--c41-grafico-neutro)";

/** A legenda das séries de dinheiro: amostra da cor, nome e, quando há, o valor. */
function LegendaDeSeries({ itens }: { itens: { rotulo: string; cor: string; valor?: string; zerado?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {itens.map((i) => (
        <li key={i.rotulo} className="inline-flex items-center gap-1.5 text-fs-2">
          <span className="size-2.5 mx-0.5 rounded-[3px] flex-shrink-0" style={{ background: i.cor }} aria-hidden />
          <span className="text-fg-secondary">{i.rotulo}</span>
          {i.valor !== undefined && <span className={`font-medium tnum ${i.zerado ? "text-fg-muted" : "text-fg"}`}>{i.valor}</span>}
        </li>
      ))}
    </ul>
  );
}

// ─── Colunas pareadas ──────────────────────────────────────────────────────

export type ParDeColunas = {
  chave: string;
  rotulo: string;
  /** Um valor por série, na ordem de `series`. Não negativos: abaixo de zero conta como zero na altura. */
  valores: readonly [number, number];
  /** Uma linha a mais na dica e na tabela acessível (ex.: o saldo do mês). */
  dica?: string;
};

/**
 * Duas séries lado a lado por período — entradas × saídas por mês —, com a
 * legenda carregando o total de cada uma.
 *
 * O valor curto vai em cima da coluna só quando o gráfico tem largura para
 * isso (consulta de contêiner, `@2xl`): mais estreito, os rótulos de duas
 * colunas coladas se atropelavam. O exato fica na dica, no total da legenda e
 * na tabela acessível — e, no fluxo, na tabela logo abaixo.
 */
export function ColunasPareadas({
  titulo,
  series,
  pares,
  formatar = numero,
  formatarCurto = numeroCurto,
  vazio = "Nada por aqui.",
}: {
  titulo: string;
  /** O nome de cada série: a primeira no azul da coluna, a segunda dois degraus mais clara. */
  series: readonly [string, string];
  pares: ParDeColunas[];
  /** O valor exato, na dica, na legenda e na tabela acessível. */
  formatar?: (n: number) => string;
  /** O rótulo em cima da coluna. */
  formatarCurto?: (n: number) => string;
  vazio?: string;
}) {
  const maior = Math.max(0, ...pares.flatMap((p) => p.valores));
  if (maior === 0) return <p className="text-helper text-fg-muted py-1.5">{vazio}</p>;

  const cores = [COR_DA_ENTRADA, COR_DA_SAIDA] as const;
  const totais = [0, 1].map((i) => pares.reduce((s, p) => s + p.valores[i], 0));

  return (
    <div className="@container min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 mb-2">
        <p className="text-fs-2 font-medium text-fg-secondary">{titulo}</p>
        <LegendaDeSeries itens={series.map((rotulo, i) => ({ rotulo, cor: cores[i], valor: formatar(totais[i]), zerado: totais[i] === 0 }))} />
      </div>
      <div aria-hidden>
        {/* O `pt-5` guarda o lugar do rótulo da coluna mais alta, como em `Colunas`. */}
        <div className="group/pares flex items-end gap-2 @2xl:gap-4 h-36 pt-5 border-b border-border">
          {pares.map((p) => (
            <div key={p.chave} className="flex-1 h-full flex items-end justify-center gap-[3px] min-w-0">
              {p.valores.map((v, i) => {
                const altura = v > 0 ? Math.max((v / maior) * 100, 3) : 0;
                return (
                  <div
                    key={series[i]}
                    className="group/col flex-1 max-w-12 h-full flex flex-col justify-end items-center min-w-0"
                    data-dica={`${p.rotulo} · ${series[i]}: ${formatar(v)}${p.dica ? `\n${p.dica}` : ""}`}
                    data-dica-rapida=""
                  >
                    {v > 0 && (
                      <span
                        className={`hidden @2xl:block shrink-0 text-micro tnum mb-1 whitespace-nowrap ${
                          v === maior ? "font-semibold text-fg" : "font-medium text-fg-secondary"
                        }`}
                      >
                        {formatarCurto(v)}
                      </span>
                    )}
                    <span
                      className="block shrink-0 w-full rounded-t-[6px] transition-opacity duration-150 group-hover/pares:opacity-45 group-hover/col:opacity-100!"
                      style={{ height: `${altura}%`, background: cores[i] }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex gap-2 @2xl:gap-4 mt-1.5">
          {pares.map((p) => (
            <span key={p.chave} className="flex-1 min-w-0 text-center text-micro text-fg-muted truncate">
              {p.rotulo}
            </span>
          ))}
        </div>
      </div>
      <TabelaOculta
        titulo={titulo}
        linhas={[
          ...pares.map((p): [string, string] => [
            p.rotulo,
            `${series[0]}: ${formatar(p.valores[0])}; ${series[1]}: ${formatar(p.valores[1])}${p.dica ? `; ${p.dica}` : ""}`,
          ]),
          ["Total do período", `${series[0]}: ${formatar(totais[0])}; ${series[1]}: ${formatar(totais[1])}`],
        ]}
      />
    </div>
  );
}

// ─── Barras ranqueadas ─────────────────────────────────────────────────────

export type LinhaRanqueada = {
  chave: string;
  rotulo: string;
  /** A linha miúda sob o nome ("3 contas · 12,0% do em aberto"). */
  sublabel?: string;
  href?: string;
  /** As partes da barra, no valor de `formatar` (ex.: vencido e a vencer, em centavos). */
  segmentos: Segmento[];
  /** A linha miúda sob o total ("R$ 300,00 vencido"). */
  nota?: string;
};

/** A barra de uma linha em dinheiro — a `Pilha`, com a dica no valor de `formatar`. */
function PilhaDeValores({ segmentos, largura, formatar }: { segmentos: Segmento[]; largura: number; formatar: (n: number) => string }) {
  const total = segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  return (
    <div className="group/pilha flex h-[26px] items-center gap-[3px]" style={{ width: `${largura}%` }} aria-hidden>
      {segmentos
        .filter((s) => s.valor > 0)
        .map((s) => (
          <span
            key={s.chave}
            className="group/seg flex h-full items-center min-w-[6px]"
            style={{ flexGrow: s.valor, flexBasis: 0 }}
            data-dica={`${s.rotulo}: ${formatar(s.valor)}${total > 0 ? ` (${PCT.format(s.valor / total)})` : ""}`}
            data-dica-rapida=""
          >
            <span
              className="block h-[18px] w-full rounded-[5px] transition-opacity duration-150 group-hover/pilha:opacity-45 group-hover/seg:opacity-100!"
              style={{ background: COR_DO_TOM[s.tom] }}
            />
          </span>
        ))}
    </div>
  );
}

/**
 * Um ranking em dinheiro (quem concentra o que está em aberto): uma barra por
 * linha, do maior para o menor, o comprimento é o total e as cores dizem a
 * situação dentro dele — `LinhasDeSituacao`, mas com o valor formatado à
 * direita em vez da contagem. Uma grade só para a lista inteira, e não uma por
 * linha: a coluna do valor tem a largura do maior, e as barras ficam na mesma
 * escala. No celular, o nome sobe para uma linha própria.
 */
export function BarrasRanqueadas({
  titulo,
  linhas,
  formatar = numero,
  vazio = "Nada por aqui.",
}: {
  titulo: string;
  linhas: LinhaRanqueada[];
  formatar?: (n: number) => string;
  vazio?: string;
}) {
  if (linhas.length === 0) return <p className="text-helper text-fg-muted py-1.5">{vazio}</p>;

  const totalDe = (l: LinhaRanqueada) => l.segmentos.reduce((s, x) => s + Math.max(0, x.valor), 0);
  const maior = Math.max(1, ...linhas.map(totalDe));
  const legenda = new Map<string, Segmento>();
  for (const l of linhas) for (const s of l.segmentos) if (!legenda.has(s.chave)) legenda.set(s.chave, { ...s, href: undefined });

  return (
    <div className="min-w-0">
      <Legenda segmentos={Array.from(legenda.values())} comValores={false} />
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        {linhas.map((l, i) => {
          const rotulo = (
            <>
              <span className="block text-fs-2 text-fg-secondary truncate">{l.rotulo}</span>
              {l.sublabel && <span className="block text-micro text-fg-muted truncate">{l.sublabel}</span>}
            </>
          );
          const cls = `col-span-2 sm:col-span-1 min-w-0 ${i > 0 ? "pt-2 sm:pt-0" : ""}`;
          return (
            <Fragmento key={l.chave}>
              {l.href ? (
                <Link href={l.href} className={`${cls} hover:[&>span:first-child]:text-brand`} data-dica={l.rotulo}>
                  {rotulo}
                </Link>
              ) : (
                <span className={cls} data-dica={l.rotulo}>
                  {rotulo}
                </span>
              )}
              <div className="min-w-0">
                <PilhaDeValores segmentos={l.segmentos} largura={(totalDe(l) / maior) * 100} formatar={formatar} />
              </div>
              <span className="text-right">
                <span className="block text-fs-2 font-medium text-fg tnum whitespace-nowrap">{formatar(totalDe(l))}</span>
                {l.nota && <span className="block text-micro text-fg-muted tnum whitespace-nowrap">{l.nota}</span>}
              </span>
            </Fragmento>
          );
        })}
      </div>
      <TabelaOculta
        titulo={titulo}
        linhas={linhas.map((l) => [
          l.rotulo,
          [formatar(totalDe(l)), ...l.segmentos.map((s) => `${s.rotulo}: ${formatar(s.valor)}`), l.sublabel].filter(Boolean).join("; "),
        ])}
      />
    </div>
  );
}

// ─── Cascata ───────────────────────────────────────────────────────────────

export type PassoDaCascata = {
  chave: string;
  rotulo: string;
  /** Total: o nível. Ajuste: o quanto soma (positivo) ou subtrai (negativo). */
  valor: number;
  tipo: "total" | "ajuste";
};

export type BarraDaCascata = { de: number; ate: number };

/**
 * Onde cada barra da cascata começa e termina, na unidade dos valores. O
 * total sai do zero e passa a ser o ponto de partida do ajuste seguinte; o
 * ajuste flutua do acumulado até o acumulado mais ele. A escala inclui o zero.
 */
export function geometriaDaCascata(passos: readonly PassoDaCascata[]): { barras: BarraDaCascata[]; minimo: number; maximo: number } {
  let acumulado = 0;
  const barras = passos.map((p) => {
    if (p.tipo === "total") {
      acumulado = p.valor;
      return { de: 0, ate: p.valor };
    }
    const de = acumulado;
    acumulado += p.valor;
    return { de, ate: acumulado };
  });
  const pontos = barras.flatMap((b) => [b.de, b.ate]);
  return { barras, minimo: Math.min(0, ...pontos), maximo: Math.max(0, ...pontos) };
}

/**
 * Uma ponte de um total a outro (resultado → caixa): os totais saem do zero
 * em cinza, os ajustes flutuam no azul do que soma ou no mais claro do que
 * subtrai, com o sinal escrito no valor. Na horizontal, porque os rótulos são
 * frases; no celular, o rótulo sobe para uma linha própria.
 */
export function Cascata({
  titulo,
  passos,
  formatar = numero,
  rotulos = { total: "Total", soma: "Soma", subtrai: "Subtrai" },
  vazio = "Nada por aqui.",
}: {
  titulo: string;
  passos: PassoDaCascata[];
  formatar?: (n: number) => string;
  /** Os nomes da legenda. */
  rotulos?: { total: string; soma: string; subtrai: string };
  vazio?: string;
}) {
  const { barras, minimo, maximo } = geometriaDaCascata(passos);
  const faixa = maximo - minimo;
  if (faixa === 0) return <p className="text-helper text-fg-muted py-1.5">{vazio}</p>;

  const posicao = (v: number) => ((v - minimo) / faixa) * 100;
  const escrito = (p: PassoDaCascata) => (p.tipo === "ajuste" && p.valor > 0 ? `+${formatar(p.valor)}` : formatar(p.valor));

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 mb-3">
        <p className="text-fs-2 font-medium text-fg-secondary">{titulo}</p>
        <LegendaDeSeries
          itens={[
            { rotulo: rotulos.total, cor: COR_DO_TOTAL },
            { rotulo: rotulos.soma, cor: COR_DA_ENTRADA },
            { rotulo: rotulos.subtrai, cor: COR_DA_SAIDA },
          ]}
        />
      </div>
      <div
        aria-hidden
        className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1"
      >
        {passos.map((p, i) => {
          const { de, ate } = barras[i];
          const total = p.tipo === "total";
          const cor = total ? COR_DO_TOTAL : p.valor > 0 ? COR_DA_ENTRADA : COR_DA_SAIDA;
          return (
            <Fragmento key={p.chave}>
              <span
                className={`col-span-2 sm:col-span-1 min-w-0 text-fs-2 leading-snug ${i > 0 ? "pt-2 sm:pt-0" : ""} ${
                  total ? "font-medium text-fg" : "text-fg-secondary"
                }`}
              >
                {p.rotulo}
              </span>
              <div className="relative h-[26px] min-w-0">
                <span className="absolute inset-y-0 w-px bg-border-strong" style={{ left: `${posicao(0)}%` }} />
                {p.valor !== 0 && (
                  <span
                    className="absolute top-1/2 -translate-y-1/2 h-[18px] min-w-[3px] rounded-[5px]"
                    style={{ left: `${posicao(Math.min(de, ate))}%`, width: `${posicao(Math.max(de, ate)) - posicao(Math.min(de, ate))}%`, background: cor }}
                    data-dica={`${p.rotulo}: ${escrito(p)}`}
                    data-dica-rapida=""
                  />
                )}
              </div>
              <span
                className={`text-right text-fs-2 tnum whitespace-nowrap ${
                  p.valor === 0 ? "text-fg-muted" : total ? `font-semibold ${p.valor < 0 ? "text-danger" : "text-fg"}` : "text-fg"
                }`}
              >
                {escrito(p)}
              </span>
            </Fragmento>
          );
        })}
      </div>
      <TabelaOculta titulo={titulo} linhas={passos.map((p) => [p.rotulo, escrito(p)])} />
    </div>
  );
}

/** As três células de uma linha das grades acima, sem caixa em volta. */
function Fragmento({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
