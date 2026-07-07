"use client";

import { useActionState } from "react";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";

type Props = {
  action: (prev: VacationState, form: FormData) => Promise<VacationState>;
};

export function AddFeriasForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="acquisitivePeriodStart" className="block text-[12px] font-medium text-fg">Período Aquisitivo — Início</label>
          <input id="acquisitivePeriodStart" name="acquisitivePeriodStart" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acquisitivePeriodEnd" className="block text-[12px] font-medium text-fg">Período Aquisitivo — Fim</label>
          <input id="acquisitivePeriodEnd" name="acquisitivePeriodEnd" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="days" className="block text-[12px] font-medium text-fg">Dias</label>
          <input id="days" name="days" type="number" min={1} max={30} defaultValue={30} className={`${INPUT} w-20`} />
        </div>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="concessivePeriodStart" className="block text-[12px] font-medium text-fg">Período Concessivo — Início</label>
          <input id="concessivePeriodStart" name="concessivePeriodStart" type="date" className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="concessivePeriodEnd" className="block text-[12px] font-medium text-fg">Período Concessivo — Fim</label>
          <input id="concessivePeriodEnd" name="concessivePeriodEnd" type="date" className={INPUT} />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary pb-2">
          <input type="checkbox" name="cashAllowance" value="true" /> Abono pecuniário
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary pb-2">
          <input type="checkbox" name="installment" value="true" /> Parcelamento
        </label>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5 flex-1">
          <label htmlFor="notes" className="block text-[12px] font-medium text-fg">Observações</label>
          <input id="notes" name="notes" type="text" className={INPUT + " w-full"} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Programando…" : "Programar Férias"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
