// Gráficos leves em SVG puro — sem dependência externa (nenhuma lib de charts
// estava instalada no projeto). Consomem os tokens do Design System via
// var(--c41-*) e funcionam em light/dark automaticamente. Tooltip nativo via
// <title>, sem JS extra.

type BarDatum = { label: string; value: number; color?: string };

// Barras horizontais — cards do Kanban por estágio, pendências por prioridade etc.
export function HorizontalBarChart({
  data,
  emptyLabel = "Sem dados suficientes ainda.",
}: {
  data: BarDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-[13px] text-fg-muted">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-[12px] text-fg-secondary w-[104px] truncate flex-shrink-0" title={d.label}>
            {d.label}
          </span>
          <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? "var(--c41-brand)" }}
              title={`${d.label}: ${d.value}`}
            />
          </div>
          <span className="text-[12px] text-fg-muted tnum w-6 text-right flex-shrink-0">{d.value}</span>
        </div>
      ))}
    </div>
  );
}

type DonutDatum = { label: string; value: number; color: string };

// Donut chart — ex: empresas por status.
export function DonutChart({
  data,
  emptyLabel = "Sem dados ainda.",
}: {
  data: DonutDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return <p className="text-[13px] text-fg-muted">{emptyLabel}</p>;
  }

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // Pré-calcula dash/offset de cada fatia num loop simples (não numa closure
  // mutada dentro do .map() do JSX — eslint-plugin-react-hooks bloqueia
  // reatribuição de variável capturada por callback usado durante o render).
  const segments: { label: string; color: string; value: number; dash: number; offset: number }[] = [];
  let cursor = 0;
  for (const d of data) {
    const dash = (d.value / total) * circumference;
    segments.push({ label: d.label, color: d.color, value: d.value, dash, offset: -cursor });
    cursor += dash;
  }

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--c41-surface-2)" strokeWidth="14" />
        {segments.map((s) => (
          <circle
            key={s.label}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${s.dash} ${circumference - s.dash}`}
            strokeDashoffset={s.offset}
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="space-y-1.5 min-w-0">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-fg-secondary truncate">{d.label}</span>
            <span className="text-fg-muted tnum ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
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
    return <p className="text-[13px] text-fg-muted">{emptyLabel}</p>;
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
              <stop offset="0%" stopColor="var(--c41-brand)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--c41-brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#trend-fill)" stroke="none" />
          <path
            d={linePath}
            fill="none"
            stroke="var(--c41-brand)"
            strokeWidth="2"
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
      <div className="flex justify-between mt-1.5 text-[10px] text-fg-muted">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

type MiniBarDatum = { label: string; value: number };

const MINI_BAR_PALETTE = [
  "var(--c41-brand)",
  "var(--c41-success)",
  "var(--c41-warning)",
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
];

// Barras verticais compactas — ex: novas empresas por mês. Pensado pra caber
// ao lado de um donut/legenda pequena, preenchendo espaço em branco em vez de
// esticar um gráfico já completo.
export function MiniBarChart({
  data,
  emptyLabel = "Sem dados suficientes ainda.",
}: {
  data: MiniBarDatum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-[13px] text-fg-muted">{emptyLabel}</p>;
  }

  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end gap-2 h-24">
      {data.map((d, i) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end min-w-0">
          <span className="text-[10px] text-fg-muted tnum">{d.value}</span>
          <div
            className="w-full rounded-t-[3px] transition-[height] duration-500"
            style={{
              height: `${Math.max((d.value / max) * 100, d.value > 0 ? 6 : 0)}%`,
              background: MINI_BAR_PALETTE[i % MINI_BAR_PALETTE.length],
            }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="text-[10px] text-fg-muted truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
