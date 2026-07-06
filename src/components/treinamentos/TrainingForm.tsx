"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { TrainingState } from "@/app/(app)/treinamentos/actions";

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

      <Field label="Nome do Treinamento *" htmlFor="name">
        <input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} className={INPUT} />
      </Field>

      <Field label="Descrição" htmlFor="description">
        <textarea id="description" name="description" rows={3} defaultValue={defaultValues?.description ?? ""} className={INPUT} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Carga Horária" htmlFor="workloadHours">
          <input id="workloadHours" name="workloadHours" type="number" step="0.5" defaultValue={defaultValues?.workloadHours ?? ""} className={INPUT} />
        </Field>
        <Field label="Validade (meses)" htmlFor="validityMonths">
          <input id="validityMonths" name="validityMonths" type="number" min={0} defaultValue={defaultValues?.validityMonths ?? ""} className={INPUT} />
        </Field>
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">{label}</label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full px-3 py-2 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
