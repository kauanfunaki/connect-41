"use client";

import { useActionState } from "react";
import type { EvaluationState } from "@/app/(app)/avaliacoes/[id]/avaliar/[personId]/actions";

type CompetencyOption = { id: string; name: string };

export type EvaluationDefaultValues = {
  notes?: string;
  developmentPlan?: string;
  improvementDeadline?: string;
  scores?: Record<string, string>;
};

type Props = {
  action: (prev: EvaluationState, form: FormData) => Promise<EvaluationState>;
  competencies: CompetencyOption[];
  defaultValues?: EvaluationDefaultValues;
};

export function EvaluationForm({ action, competencies, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="space-y-3">
        <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider border-b border-border pb-2">
          Notas por Competência (0-10)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {competencies.map((c) => (
            <div key={c.id} className="space-y-1.5">
              <label htmlFor={`score_${c.id}`} className="block text-[12px] font-medium text-fg">{c.name}</label>
              <input
                id={`score_${c.id}`}
                name={`score_${c.id}`}
                type="number"
                min={0}
                max={10}
                step="0.5"
                defaultValue={defaultValues?.scores?.[c.id] ?? ""}
                className={INPUT}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-[12px] font-medium text-fg">Observações</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} className={INPUT} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="developmentPlan" className="block text-[12px] font-medium text-fg">Plano de Desenvolvimento</label>
          <textarea id="developmentPlan" name="developmentPlan" rows={3} defaultValue={defaultValues?.developmentPlan ?? ""} className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="improvementDeadline" className="block text-[12px] font-medium text-fg">Prazo de Melhoria</label>
          <input id="improvementDeadline" name="improvementDeadline" type="date" defaultValue={defaultValues?.improvementDeadline ?? ""} className={INPUT} />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Salvando…" : "Salvar Avaliação"}
      </button>
    </form>
  );
}

const INPUT =
  "w-full px-3 py-2 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
