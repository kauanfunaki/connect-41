"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type TimeEntryData = {
  id: string;
  userId: string;
  userName: string;
  minutes: number;
  note: string | null;
  loggedOnLabel: string;
  canDelete: boolean;
};

type Props = {
  canAct: boolean;
  estimateMinutes: number | null;
  entries: TimeEntryData[];
  estimateAction: (minutes: string) => Promise<void>;
  createEntryAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  deleteEntryAction: (entryId: string) => Promise<void>;
};

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}min`;
}

export function TimeTrackingSection({ canAct, estimateMinutes, entries, estimateAction, createEntryAction, deleteEntryAction }: Props) {
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [estimateValue, setEstimateValue] = useState(estimateMinutes != null ? String(estimateMinutes) : "");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalLogged = entries.reduce((sum, e) => sum + e.minutes, 0);

  function saveEstimate() {
    startTransition(() => estimateAction(estimateValue));
    setEditingEstimate(false);
  }

  function addEntry() {
    const m = parseInt(minutes, 10);
    if (!Number.isInteger(m) || m <= 0) return;
    const form = new FormData();
    form.set("minutes", minutes);
    if (note.trim()) form.set("note", note.trim());
    startTransition(() => { createEntryAction(null, form); });
    setMinutes("");
    setNote("");
  }

  if (entries.length === 0 && estimateMinutes == null && !canAct) return null;

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Tempo</h2>
        <div className="flex items-center gap-3 text-[11px] text-fg-muted">
          {editingEstimate ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                value={estimateValue}
                onChange={(e) => setEstimateValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveEstimate()}
                className="w-20 h-7"
                placeholder="min"
              />
              <button type="button" onClick={saveEstimate} className="text-brand hover:underline">Salvar</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => canAct && setEditingEstimate(true)}
              className={canAct ? "hover:text-fg transition-colors" : ""}
            >
              Estimativa: {estimateMinutes != null ? formatMinutes(estimateMinutes) : "—"}
            </button>
          )}
          {entries.length > 0 && (
            <span className="tnum">
              Gasto: {formatMinutes(totalLogged)}
              {estimateMinutes != null && (totalLogged > estimateMinutes ? " (acima da estimativa)" : "")}
            </span>
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="divide-y divide-border mb-3">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 py-1.5 group">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-fg">
                  <span className="font-medium">{formatMinutes(e.minutes)}</span>
                  {" · "}
                  <span className="text-fg-muted">{e.userName} · {e.loggedOnLabel}</span>
                </p>
                {e.note && <p className="text-[12px] text-fg-muted truncate">{e.note}</p>}
              </div>
              {e.canDelete && (
                <button
                  type="button"
                  onClick={() => startTransition(() => deleteEntryAction(e.id))}
                  className="text-fg-muted hover:text-danger p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remover apontamento"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAct && (
        <div className="flex items-center gap-2 pt-2 border-t border-border flex-wrap">
          <Input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="minutos"
            className="w-24"
          />
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addEntry()}
            placeholder="nota (opcional)"
            className="flex-1 min-w-[120px]"
          />
          <button
            type="button"
            onClick={addEntry}
            disabled={isPending}
            className="h-9 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
          >
            Apontar
          </button>
        </div>
      )}
    </div>
  );
}
