// Gráficos leves em SVG puro — sem dependência externa (nenhuma lib de charts
// estava instalada no projeto). Consomem os tokens do Design System via
// var(--c41-*) e funcionam em light/dark automaticamente. Tooltip nativo via
// <title>, sem JS extra.
//
// Restam os dois da "Visão do workspace" da Home; gráfico novo vai no
// `Graficos.tsx`, a família dos painéis. O donut e as mini barras (com a
// paleta arco-íris crua que a Home já tinha cortado) saíram em 07/10, sem uso.

type BarDatum = {
  /** Identidade da barra. Obrigatório quando dois itens podem repetir o mesmo `label`. */
  key?: string;
  label: string;
  /** Segunda linha menor sob o rótulo — ex.: de qual kanban vem aquele estágio. */
  sublabel?: string;
  value: number;
  color?: string;
};

// Barras horizontais — cards do Kanban por estágio, pendências por prioridade etc.
// Barra de 18px com cantos arredondados (06/10, opção B): o mesmo volume das
// barras dos painéis (Graficos.tsx).
export function HorizontalBarChart({
  data,
  emptyLabel = "Sem dados suficientes ainda.",
}: {
  data: BarDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-fs-3 text-fg-muted">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.key ?? d.label} className="flex items-center gap-3">
          <span
            className="w-[124px] flex-shrink-0 min-w-0"
            title={d.sublabel ? `${d.label} · ${d.sublabel}` : d.label}
          >
            <span className="block text-fs-2 text-fg-secondary truncate">{d.label}</span>
            {d.sublabel && <span className="block text-micro text-fg-muted truncate">{d.sublabel}</span>}
          </span>
          <div className="flex-1 h-[18px] rounded-[5px] bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-[5px] transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? "var(--c41-brand)" }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-fs-2 font-medium text-fg tnum w-6 text-right flex-shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

type TrendDatum = { label: string; value: number };

// Linha de tendência com área preenchida em gradiente — ex: movimentações nos
// últimos dias. Y é mapeado com margem interna (padY) pra o pico do gráfico
// (value === max) nunca tocar a borda exata do viewBox — sem essa margem o
// traço/os pontos ficavam cortados pela borda de recorte do SVG.
export function TrendChart({
  data,
  emptyLabel = "Sem movimentações registradas ainda.",
}: {
  data: TrendDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-fs-3 text-fg-muted">{emptyLabel}</p>;
  }

  const w = 100;
  const h = 40;
  const padY = 5;
  const plotH = h - padY * 2;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => [i * stepX, padY + plotH - (d.value / max) * plotH] as const);
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;

  return (
    <div>
      {/* Wrapper relativo — os pontos são <div>s posicionados por percentual em
          cima do SVG, não <circle>s dentro dele: o viewBox é esticado de forma
          não-uniforme (preserveAspectRatio="none", necessário pra área/linha
          preencherem a largura toda), o que deformaria círculos em elipses. */}
      <div className="relative w-full h-24">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--c41-brand)" stopOpacity="0.36" />
              <stop offset="100%" stopColor="var(--c41-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#trend-fill)" stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--c41-brand)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {points.map(([x, y], i) => (
          <span
            key={i}
            className="absolute w-[7px] h-[7px] rounded-full bg-[var(--c41-brand)] -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(x / w) * 100}%`, top: `${(y / h) * 100}%` }}
            title={`${data[i].label}: ${data[i].value}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1.5 text-micro text-fg-muted">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
