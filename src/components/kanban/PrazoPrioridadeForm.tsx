"use client";

import { useActionState } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  dueDate: string | null;
  priority: number;
};

export function PrazoPrioridadeForm({ action, dueDate, priority }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="dueDate" className="block text-[11px] font-medium text-fg-muted">Prazo</label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={dueDate ? dueDate.slice(0, 10) : ""}
            className={INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="priority" className="block text-[11px] font-medium text-fg-muted">Prioridade</label>
          <select id="priority" name="priority" defaultValue={String(priority)} className={INPUT}>
            <option value="0">Normal</option>
            <option value="1">Alta</option>
            <option value="2">Urgente</option>
          </select>
        </div>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
