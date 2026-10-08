"use client";

import { useActionState } from "react";
import type { EvaluationState } from "@/app/(app)/avaliacoes/[id]/avaliar/[personId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";

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
  /** Volta para o ciclo — o rodapé não tinha "Cancelar" (até 30/09). */
  cancelHref: string;
  defaultValues?: EvaluationDefaultValues;
};

export function EvaluationForm({ action, competencies, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <div>
        <FormSection title="Notas por Competência (0-10)">
          {/* Nota de 0 a 10 não precisa de meia tela: cada competência é uma
              linha com o nome à esquerda e a nota numa coluna estreita à
              direita. Com o rótulo em cima (até 30/09), nome de competência
              que quebrava em duas linhas descia o campo dela em relação ao
              vizinho. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {competencies.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 min-w-0">
                <label
                  htmlFor={`score_${c.id}`}
                  className="min-w-0 text-[length:var(--fs-label)] font-medium leading-5 text-fg"
                >
                  {c.name}
                </label>
                <Input
                  id={`score_${c.id}`}
                  name={`score_${c.id}`}
                  type="number"
                  min={0}
                  max={10}
                  step="0.5"
                  className="w-24 shrink-0"
                  defaultValue={defaultValues?.scores?.[c.id] ?? ""}
                />
              </div>
            ))}
          </div>
        </FormSection>

        <FormSection title="Desenvolvimento">
          <CampoForm label="Observações" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
          </CampoForm>
          {/* O plano (texto longo) ia lado a lado com o prazo (uma data), e a
              caixa de texto ficava da altura de três campos do vizinho. */}
          <CampoForm label="Plano de Desenvolvimento" htmlFor="developmentPlan">
            <Textarea id="developmentPlan" name="developmentPlan" rows={3} defaultValue={defaultValues?.developmentPlan ?? ""} />
          </CampoForm>
          <FieldGrid columns="sm:grid-cols-[180px]">
            <CampoForm label="Prazo de Melhoria" htmlFor="improvementDeadline">
              <CampoData id="improvementDeadline" name="improvementDeadline" defaultValue={defaultValues?.improvementDeadline ?? ""} />
            </CampoForm>
          </FieldGrid>
        </FormSection>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} submitLabel="Salvar Avaliação" />
    </form>
  );
}
