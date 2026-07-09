"use client";

import { useState } from "react";
import { AddNoteForm } from "@/components/kanban/AddNoteForm";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type FeedItem = {
  id: string;
  type: string;
  label: string;
  createdAtLabel: string;
  userName: string;
  content: string | null;
  importante: boolean;
};

type Props = {
  items: FeedItem[];
  canAct: boolean;
  addNoteAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

// Modo resumido: comentários + as 2 movimentações mais recentes (a lista já vem
// ordenada da mais nova para a mais antiga). Modo detalhado: tudo, sem filtro.
function summarize(items: FeedItem[]): FeedItem[] {
  let nonNoteCount = 0;
  return items.filter((item) => {
    if (item.type === "NOTE") return true;
    nonNoteCount += 1;
    return nonNoteCount <= 2;
  });
}

export function ActivityFeed({ items, canAct, addNoteAction }: Props) {
  const [detailed, setDetailed] = useState(false);

  const visible = detailed ? items : summarize(items);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 lg:sticky lg:top-6 self-start">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Comentários e atividade</h2>
        {items.length > 0 && (
          <button
            type="button"
            onClick={() => setDetailed((v) => !v)}
            className="h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            {detailed ? "Ocultar detalhes" : "Mostrar detalhes"}
          </button>
        )}
      </div>

      {canAct && (
        <div className="mb-3">
          <AddNoteForm action={addNoteAction} />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="scroll-y max-h-[320px] overflow-y-auto">
          {visible.map((a, i) => (
            <div key={a.id} className="flex gap-2.5 relative pb-3 last:pb-0">
              {i < visible.length - 1 && (
                <span className="absolute left-[9px] top-[20px] bottom-0 w-px bg-border" />
              )}
              <span
                className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 z-[1] border ${
                  a.importante ? "bg-brand-subtle border-brand" : "bg-surface-hover border-border-strong"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${a.importante ? "bg-brand" : "bg-fg-muted"}`} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[length:var(--fs-body)] text-fg font-medium leading-snug">{a.label}</p>
                  <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap flex-shrink-0">
                    {a.createdAtLabel}
                  </span>
                </div>
                <p className="text-[length:var(--fs-helper)] text-fg-muted">{a.userName}</p>
                {a.content && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-1">{a.content}</p>}
              </div>
            </div>
          ))}

          {!detailed && hiddenCount > 0 && (
            <p className="text-[11px] text-fg-muted pt-1">
              + {hiddenCount} movimentação{hiddenCount > 1 ? "s" : ""} oculta{hiddenCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
