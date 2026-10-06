import Link from "next/link";
import { ArrowUpRight, CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";

// Gráficos dos painéis da Home (30/09) — a leitura "Power BI" que o Kauan
// trouxe do HubStrom, no vocabulário do Perímetro. Server components puros:
// SVG/HTML sem lib de gráfico, dica pelo `DicaFlutuante` (`data-dica`) e
// clique que leva para a lista já filtrada, quando existe uma.
//
// Regras seguidas (método de dataviz):
// - cor de situação é reservada e sempre vem com ícone + rótulo na legenda;
// - número em texto neutro, nunca na cor da série;
// - cada gráfico leva uma tabela `sr-only` com os mesmos números.
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
  /** Segunda linha da dica — ex.: o valor em reais da fatia. */
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
  /** O número principal e o que ele é. */
  destaque?: { valor: string; legenda: string; tom?: Tom };
  children: React.ReactNode;
  rodape?: React.ReactNode;
}) {
  const corDoSetor = cor ?? "var(--c41-brand)";
  return (
    <section
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

      {destaque && (
        <p className="mt-3 flex items-baseline gap-2 min-w-0">
          <span
            className="font-display text-[length:var(--fs-metric)] font-bold leading-none tracking-tight tnum truncate c41-cortavel"
            style={destaque.tom && destaque.tom !== "neutro" ? { color: COR_DO_TOM[destaque.tom] } : undefined}
          >
            {destaque.valor}
          </span>
          <span className="text-[length:var(--fs-helper)] text-fg-muted truncate">{destaque.legenda}</span>
        </p>
      )}

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
          <Link key={s.chave} href={s.href} aria-label={`${s.rotulo}: ${numero(s.valor)}`} {...comum}>
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

function Legenda({ segmentos, comValores = true }: { segmentos: Segmento[]; comValores?: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
      {segmentos.map((s) => {
        const conteudo = (
          <>
            <IconeDoTom tom={s.tom} />
            <span className="text-fg-secondary">{s.rotulo}</span>
            {comValores && <span className="text-fg font-medium tnum">{numero(s.valor)}</span>}
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
      <TabelaOculta titulo={titulo ?? "Situação"} linhas={segmentos.map((s) => [s.rotulo, numero(s.valor)])} />
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
        linhas={linhas.map((l) => [l.rotulo, l.segmentos.map((s) => `${s.rotulo}: ${numero(s.valor)}`).join("; ")])}
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
      <div className="relative size-[132px] flex-shrink-0">
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
      <TabelaOculta titulo={titulo} linhas={segmentos.map((s) => [s.rotulo, numero(s.valor)])} />
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
      <div className="group/colunas relative flex items-end gap-[3px] h-36 pt-5 border-b border-border">
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
      <TabelaOculta titulo={titulo} linhas={colunas.map((c) => [c.rotulo, formatar(c.valor)])} />
    </div>
  );
}

// ─── Funil ─────────────────────────────────────────────────────────────────

export type Etapa = { chave: string; rotulo: string; valor: number; href?: string };

/**
 * Funil de etapas (candidaturas por fase): barras centradas, uma cor só, com
 * a passagem de uma etapa para a seguinte em percentual.
 */
export function Funil({ titulo, etapas, vazio = "Nada por aqui." }: { titulo: string; etapas: Etapa[]; vazio?: string }) {
  const maior = Math.max(0, ...etapas.map((e) => e.valor));
  if (maior === 0) return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{vazio}</p>;

  return (
    <div className="group/funil min-w-0 space-y-1">
      {etapas.map((e, i) => {
        const anterior = i > 0 ? etapas[i - 1].valor : null;
        const passagem = anterior && anterior > 0 ? PCT.format(e.valor / anterior) : null;
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
        const dica = `${e.rotulo}: ${numero(e.valor)}${passagem ? `\n${passagem} da etapa anterior` : ""}`;
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
      <TabelaOculta titulo={titulo} linhas={etapas.map((e) => [e.rotulo, numero(e.valor)])} />
    </div>
  );
}
