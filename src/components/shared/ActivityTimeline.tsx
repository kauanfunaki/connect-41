import { formatInstantDateTime } from "@/lib/format";

const ACTIVITY_LABEL: Record<string, string> = {
  NOTE: "Nota",
  STATUS_CHANGE: "Mudança de estágio",
  DOCUMENT: "Documento",
  HANDOFF: "Handoff",
  MENTION: "Menção",
};

export type ActivityEntry = {
  id: string;
  type: string;
  content: string | null;
  createdAt: Date;
  userName: string;
  contextLabel?: string | null;
};

type Props = {
  activities: ActivityEntry[];
  emptyLabel?: string;
};

// Timeline com linha conectora + dot — mesmo padrão visual do painel de
// atividades do item de Kanban, extraído para reuso na ficha de empresa.
export function ActivityTimeline({ activities, emptyLabel = "Nenhuma atividade registrada ainda." }: Props) {
  if (activities.length === 0) {
    return <p className="text-[length:var(--fs-helper)] text-fg-muted">{emptyLabel}</p>;
  }

  return (
    <div className="scroll-y max-h-[560px] overflow-y-auto">
      {activities.map((a, i) => {
        const importante = a.type === "STATUS_CHANGE" || a.type === "HANDOFF";
        return (
          <div key={a.id} className="flex gap-3 relative pb-4 last:pb-0">
            {i < activities.length - 1 && (
              <span className="absolute left-[10px] top-[22px] bottom-0 w-px bg-border" />
            )}
            <span
              className={`w-[21px] h-[21px] rounded-full flex items-center justify-center flex-shrink-0 z-[1] border ${
                importante ? "bg-brand-subtle border-brand" : "bg-surface-hover border-border-strong"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${importante ? "bg-brand" : "bg-fg-muted"}`} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[length:var(--fs-body)] text-fg font-medium leading-snug">
                  {ACTIVITY_LABEL[a.type] ?? a.type}
                  {a.contextLabel && <span className="text-fg-muted font-normal"> · {a.contextLabel}</span>}
                </p>
                <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap flex-shrink-0">
                  {formatInstantDateTime(a.createdAt)}
                </span>
              </div>
              <p className="text-[length:var(--fs-helper)] text-fg-muted">{a.userName}</p>
              {a.content && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-1">{a.content}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
