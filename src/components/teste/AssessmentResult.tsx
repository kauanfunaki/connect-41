import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { DiscBars } from "./DiscBars";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

type Props =
  | {
      type: "DISC";
      scores: DiscScores;
      primaryProfile: DiscDimension;
      secondaryProfile: DiscDimension | null;
      compact?: boolean;
      detailHref?: string;
    }
  | {
      type: "MULTIPLA_ESCOLHA";
      scores: QuizScores;
      templateName: string;
      compact?: boolean;
      detailHref?: string;
    };

// Um resultado, dois formatos: DISC delega pro DiscBars (intocado); múltipla
// escolha tem só um agregado (% de acertos), não 4 dimensões — barra única.
export function AssessmentResult(props: Props) {
  if (props.type === "DISC") {
    const { scores, primaryProfile, secondaryProfile, compact, detailHref } = props;
    return (
      <DiscBars
        scores={scores}
        primaryProfile={primaryProfile}
        secondaryProfile={secondaryProfile}
        compact={compact}
        detailHref={detailHref}
      />
    );
  }

  const { scores, templateName, compact, detailHref } = props;
  return (
    <div>
      {/* O resultado em destaque: o `Selo`, no lugar da pílula à mão (auditoria DRG-06, 07/10/2026). */}
      <Selo tom="marca" className="mb-3">
        {scores.correct} de {scores.total} acertos ({scores.pct}%)
      </Selo>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-full bg-brand" style={{ width: `${scores.pct}%` }} />
      </div>
      {!compact && <p className="text-[length:var(--fs-2)] text-fg-muted mt-2">{templateName}</p>}
      {compact && detailHref && (
        <Button href={detailHref} variant="secondary" size="xs" className="mt-3">
          Ver detalhe completo <ArrowRight size={11} />
        </Button>
      )}
    </div>
  );
}
