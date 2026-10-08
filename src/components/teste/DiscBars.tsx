import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
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
      {/* O perfil em destaque: o `Selo`, no lugar da pílula à mão (auditoria DRG-06, 07/10/2026). */}
      <Selo tom="marca" className="mb-3">
        Perfil {profileCode} — {profileLabel}
      </Selo>

      <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
        {DIMENSIONS.map((dim) => (
          <div key={dim} className="flex items-center gap-2">
            <span className="w-5 text-micro font-medium text-fg-muted">{dim}</span>
            <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className={`h-full rounded-full ${DIM_COLOR[dim]}`} style={{ width: `${scores[dim].pct}%` }} />
            </div>
            <span className="w-9 text-right text-micro text-fg-muted tnum">{scores[dim].pct}%</span>
          </div>
        ))}
      </div>

      {/* Botão, e não link de texto (30/09): é a ação de abrir o teste. */}
      {compact && detailHref && (
        <Button href={detailHref} variant="secondary" size="xs" className="mt-3">
          Ver detalhe completo <ArrowRight size={11} />
        </Button>
      )}
    </div>
  );
}
