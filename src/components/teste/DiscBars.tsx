import Link from "next/link";
import { DISC_LABEL, type DiscScores, type DiscDimension } from "@/lib/disc";

type Props = {
  scores: DiscScores;
  primaryProfile: DiscDimension;
  secondaryProfile: DiscDimension | null;
  compact?: boolean;
  detailHref?: string;
};

const DIMENSIONS: DiscDimension[] = ["D", "I", "S", "C"];

const DIM_COLOR: Record<DiscDimension, string> = {
  D: "bg-danger",
  I: "bg-warning",
  S: "bg-success",
  C: "bg-brand",
};

export function DiscBars({ scores, primaryProfile, secondaryProfile, compact = false, detailHref }: Props) {
  const profileCode = primaryProfile + (secondaryProfile ?? "");
  const profileLabel = secondaryProfile
    ? `${DISC_LABEL[primaryProfile]} / ${DISC_LABEL[secondaryProfile]}`
    : DISC_LABEL[primaryProfile];

  return (
    <div>
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-brand/10 text-brand border border-brand/25 mb-3">
        Perfil {profileCode} — {profileLabel}
      </span>

      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {DIMENSIONS.map((dim) => (
          <div key={dim} className="flex items-center gap-2">
            <span className="w-5 text-[11px] font-medium text-fg-muted">{dim}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className={`h-full rounded-full ${DIM_COLOR[dim]}`} style={{ width: `${scores[dim].pct}%` }} />
            </div>
            <span className="w-9 text-right text-[11px] text-fg-muted tnum">{scores[dim].pct}%</span>
          </div>
        ))}
      </div>

      {compact && detailHref && (
        <Link href={detailHref} className="inline-block mt-3 text-[12px] text-brand hover:underline">
          Ver detalhe completo
        </Link>
      )}
    </div>
  );
}
