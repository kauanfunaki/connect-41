"use client";

import { useActionState } from "react";
import type { TrainingState } from "@/app/(app)/treinamentos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { FormFooter } from "@/components/ui/FormFooter";

export type TrainingDefaultValues = {
  id?: string;
  name?: string;
  description?: string;
  workloadHours?: string;
  validityMonths?: number;
};

type Props = {
  action: (prev: TrainingState, form: FormData) => Promise<TrainingState>;
  cancelHref: string;
  defaultValues?: TrainingDefaultValues;
};

export function TrainingForm({ action, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[length:var(--fs-ui)] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <CampoForm label="Nome do Treinamento" htmlFor="name" required>
        <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
      </CampoForm>

      <CampoForm label="Descrição" htmlFor="description">
        <Textarea id="description" name="description" rows={3} defaultValue={defaultValues?.description ?? ""} />
      </CampoForm>

      {/* Horas e meses são números curtos: colunas estreitas, e não meia tela
          cada (até 30/09). A unidade saiu do rótulo para o sufixo do campo. */}
      <FieldGrid columns="sm:grid-cols-[180px_180px]">
        <CampoForm label="Carga Horária" htmlFor="workloadHours">
          <Input id="workloadHours" name="workloadHours" type="number" step="0.5" defaultValue={defaultValues?.workloadHours ?? ""} suffix="h" />
        </CampoForm>
        <CampoForm label="Validade" htmlFor="validityMonths">
          <Input id="validityMonths" name="validityMonths" type="number" min={0} defaultValue={defaultValues?.validityMonths ?? ""} suffix="meses" />
        </CampoForm>
      </FieldGrid>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
