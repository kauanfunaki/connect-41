"use client";

import { useActionState } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CampoForm label="Prazo" htmlFor="dueDate">
          <Input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={dueDate ? dueDate.slice(0, 10) : ""}
          />
        </CampoForm>
        <CampoForm label="Prioridade" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue={String(priority)}>
            <option value="0">Normal</option>
            <option value="1">Alta</option>
            <option value="2">Urgente</option>
          </Select>
        </CampoForm>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-3 rounded-md border border-border text-[12px] font-medium text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
