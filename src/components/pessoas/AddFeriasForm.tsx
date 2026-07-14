"use client";

import { useActionState } from "react";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: VacationState, form: FormData) => Promise<VacationState>;
};

export function AddFeriasForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <CampoForm label="Período Aquisitivo — Início" htmlFor="acquisitivePeriodStart" required>
          <Input id="acquisitivePeriodStart" name="acquisitivePeriodStart" type="date" required />
        </CampoForm>
        <CampoForm label="Período Aquisitivo — Fim" htmlFor="acquisitivePeriodEnd" required>
          <Input id="acquisitivePeriodEnd" name="acquisitivePeriodEnd" type="date" required />
        </CampoForm>
        <CampoForm label="Dias" htmlFor="days">
          <Input id="days" name="days" type="number" min={1} max={30} defaultValue={30} />
        </CampoForm>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-52">
          <CampoForm label="Período Concessivo — Início" htmlFor="concessivePeriodStart">
            <Input id="concessivePeriodStart" name="concessivePeriodStart" type="date" />
          </CampoForm>
        </div>
        <div className="w-52">
          <CampoForm label="Período Concessivo — Fim" htmlFor="concessivePeriodEnd">
            <Input id="concessivePeriodEnd" name="concessivePeriodEnd" type="date" />
          </CampoForm>
        </div>
        <div className="pb-2">
          <Checkbox id="cashAllowance" name="cashAllowance" value="true" label="Abono pecuniário" />
        </div>
        <div className="pb-2">
          <Checkbox id="installment" name="installment" value="true" label="Parcelamento" />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <CampoForm label="Observações" htmlFor="notes">
            <Input id="notes" name="notes" type="text" />
          </CampoForm>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Programando…" : "Programar Férias"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
