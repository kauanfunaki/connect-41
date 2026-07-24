type Props = {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
};

// Cor por faixa — dá pra bater o olho em quem precisa de atenção sem ler o
// número. Faixas iguais às já usadas em StageDot/status pills do app.
function ringColor(score: number): string {
  if (score >= 80) return "var(--c41-success)";
  if (score >= 60) return "var(--c41-warning)";
  return "var(--c41-danger)";
}

export function ScoreRing({ score, size = 128, strokeWidth = 10, label }: Props) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = ringColor(clamped);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--c41-surface-hover)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[28px] font-semibold text-fg tabular-nums leading-none">{Math.round(clamped)}</span>
        {label && <span className="text-[11px] text-fg-muted mt-1">{label}</span>}
      </div>
    </div>
  );
}
