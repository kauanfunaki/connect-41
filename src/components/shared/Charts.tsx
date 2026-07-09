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
  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox="0 0 100 100" className="w-28 h-28 flex-shrink-0 -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--c41-surface-2)" strokeWidth="14" />
        {data.map((d) => {
          const frac = d.value / total;
          const dash = frac * circumference;
          const dashOffset = -offsetAcc;
          offsetAcc += dash;
          return (
            <circle
              key={d.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={d.color}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={dashOffset}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
        })}
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

// Linha de tendência — ex: movimentações nos últimos dias.
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
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data.map((d, i) => [i * stepX, h - (d.value / max) * h] as const);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-24">
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="var(--c41-brand)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.8" fill="var(--c41-brand)" vectorEffect="non-scaling-stroke">
            <title>{`${data[i].label}: ${data[i].value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between mt-1.5 text-[10px] text-fg-muted">
        <span>{data[0].label}</span>
        <span>{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}
