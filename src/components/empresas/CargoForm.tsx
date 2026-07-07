"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CargoState } from "@/app/(app)/empresas/[id]/cargos/actions";

export type CargoDefaultValues = {
  id?: string;
  name?: string;
  area?: string;
  description?: string;
  technicalRequirements?: string;
  behavioralRequirements?: string;
  salaryRangeMin?: string;
  salaryRangeMid?: string;
  salaryRangeMax?: string;
};

type Props = {
  action: (prev: CargoState, form: FormData) => Promise<CargoState>;
  companyId: string;
  cancelHref: string;
  defaultValues?: CargoDefaultValues;
};

export function CargoForm({ action, companyId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome do Cargo *" htmlFor="name">
          <input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} className={INPUT} />
        </Field>
        <Field label="Área" htmlFor="area">
          <input id="area" name="area" type="text" defaultValue={defaultValues?.area ?? ""} className={INPUT} />
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description">
        <textarea id="description" name="description" rows={2} defaultValue={defaultValues?.description ?? ""} className={INPUT} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Requisitos Técnicos" htmlFor="technicalRequirements">
          <textarea id="technicalRequirements" name="technicalRequirements" rows={3} defaultValue={defaultValues?.technicalRequirements ?? ""} className={INPUT} />
        </Field>
        <Field label="Requisitos Comportamentais" htmlFor="behavioralRequirements">
          <textarea id="behavioralRequirements" name="behavioralRequirements" rows={3} defaultValue={defaultValues?.behavioralRequirements ?? ""} className={INPUT} />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Faixa Salarial Inicial" htmlFor="salaryRangeMin">
          <input id="salaryRangeMin" name="salaryRangeMin" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMin ?? ""} className={INPUT} />
        </Field>
        <Field label="Faixa Salarial Intermediária" htmlFor="salaryRangeMid">
          <input id="salaryRangeMid" name="salaryRangeMid" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMid ?? ""} className={INPUT} />
        </Field>
        <Field label="Faixa Salarial Final" htmlFor="salaryRangeMax">
          <input id="salaryRangeMax" name="salaryRangeMax" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMax ?? ""} className={INPUT} />
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
