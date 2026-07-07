"use client";

import { useActionState } from "react";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";

type Props = {
  action: (prev: PayrollCompetencyState, form: FormData) => Promise<PayrollCompetencyState>;
  companyId: string;
};

export function AbrirCompetenciaForm({ action, companyId }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const now = new Date();

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="space-y-1.5">
        <label htmlFor="month" className="block text-[12px] font-medium text-fg">Mês</label>
        <input id="month" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} className={`${INPUT} w-20`} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="year" className="block text-[12px] font-medium text-fg">Ano</label>
        <input id="year" name="year" type="number" min={2000} defaultValue={now.getFullYear()} className={`${INPUT} w-24`} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Abrindo…" : "Abrir Competência"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
