"use client";

import { useActionState } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  dueDate: string | null;
  priority: number;
};

export function PrazoPrioridadeForm({ action, dueDate, priority }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Prazo" htmlFor="dueDate">
          <CampoData
            id="dueDate"
            name="dueDate"
           
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
      <Button
        variant="secondary"
        size="md"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
