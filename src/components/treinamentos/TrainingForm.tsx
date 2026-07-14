"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { TrainingState } from "@/app/(app)/treinamentos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

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
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <CampoForm label="Nome do Treinamento" htmlFor="name" required>
        <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
      </CampoForm>

      <CampoForm label="Descrição" htmlFor="description">
        <Textarea id="description" name="description" rows={3} defaultValue={defaultValues?.description ?? ""} />
      </CampoForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Carga Horária" htmlFor="workloadHours">
          <Input id="workloadHours" name="workloadHours" type="number" step="0.5" defaultValue={defaultValues?.workloadHours ?? ""} suffix="h" />
        </CampoForm>
        <CampoForm label="Validade (meses)" htmlFor="validityMonths">
          <Input id="validityMonths" name="validityMonths" type="number" min={0} defaultValue={defaultValues?.validityMonths ?? ""} />
        </CampoForm>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link href={cancelHref} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
