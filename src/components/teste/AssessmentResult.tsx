import Link from "next/link";
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
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-medium bg-brand/10 text-brand border border-brand/25 mb-3">
        {scores.correct} de {scores.total} acertos ({scores.pct}%)
      </span>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-full bg-brand" style={{ width: `${scores.pct}%` }} />
      </div>
      {!compact && <p className="text-[12px] text-fg-muted mt-2">{templateName}</p>}
      {compact && detailHref && (
        <Link href={detailHref} className="inline-block mt-3 text-[12px] text-brand hover:underline">
          Ver detalhe completo
        </Link>
      )}
    </div>
  );
}
