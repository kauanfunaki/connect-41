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
// o "sem situação" de propósito.
//
// Cor e volume (06/10, opção B escolhida pelo Kauan — achou os gráficos
// bons, mas apagados): o mesmo conteúdo com mais presença, em todas as telas
// que usam estes componentes. Topo do cartão tingido na cor do setor, filete
// de 4px, número principal em Space Grotesk; barras de 18px com 3px de vão e
// cada segmento arredondado; rosca mais grossa; colunas em degradê com o
// valor em cima de cada uma; sombra mais funda.

export type Tom = "critico" | "atencao" | "ok" | "proximo" | "neutro";

const COR_DO_TOM: Record<Tom, string> = {
  critico: "var(--c41-danger)",
  atencao: "var(--c41-warning)",
  ok: "var(--c41-success)",
  proximo: "var(--c41-grafico-proximo)",
  neutro: "var(--c41-grafico-neutro)",
};

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
  bom: "bg-success-bg text-success",
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
            style={{ background: COR_DO_TOM[s.tom] }}
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
              stroke={COR_DO_TOM[f.tom]}
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
