"use client";

import { useActionState } from "react";
import type { ExameState } from "@/app/(app)/pessoas/[id]/exames/actions";

type Props = {
  action: (prev: ExameState, form: FormData) => Promise<ExameState>;
};

export function AddExameForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
      <div className="space-y-1.5">
        <label htmlFor="clinicName" className="block text-[12px] font-medium text-fg">Clínica</label>
        <input id="clinicName" name="clinicName" type="text" className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="scheduledAt" className="block text-[12px] font-medium text-fg">Data Agendada</label>
        <input id="scheduledAt" name="scheduledAt" type="date" className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="asoDueDate" className="block text-[12px] font-medium text-fg">Prazo do ASO</label>
        <input id="asoDueDate" name="asoDueDate" type="date" className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-[12px] font-medium text-fg">Observações</label>
        <input id="notes" name="notes" type="text" className={INPUT} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Registrando…" : "Solicitar Exame"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
