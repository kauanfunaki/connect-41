"use client";

import { useActionState } from "react";
import type { EvaluationState } from "@/app/(app)/avaliacoes/[id]/avaliar/[personId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

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
            <CampoForm key={c.id} label={c.name} htmlFor={`score_${c.id}`}>
              <Input
                id={`score_${c.id}`}
                name={`score_${c.id}`}
                type="number"
                min={0}
                max={10}
                step="0.5"
                defaultValue={defaultValues?.scores?.[c.id] ?? ""}
              />
            </CampoForm>
          ))}
        </div>
      </div>

      <CampoForm label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
      </CampoForm>

      <div className="grid grid-cols-2 gap-4">
        <CampoForm label="Plano de Desenvolvimento" htmlFor="developmentPlan">
          <Textarea id="developmentPlan" name="developmentPlan" rows={3} defaultValue={defaultValues?.developmentPlan ?? ""} />
        </CampoForm>
        <CampoForm label="Prazo de Melhoria" htmlFor="improvementDeadline">
          <Input id="improvementDeadline" name="improvementDeadline" type="date" defaultValue={defaultValues?.improvementDeadline ?? ""} />
        </CampoForm>
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
