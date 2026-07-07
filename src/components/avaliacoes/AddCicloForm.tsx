"use client";

import { useActionState } from "react";
import type { EvaluationCycleState } from "@/app/(app)/avaliacoes/actions";

type Props = {
  action: (prev: EvaluationCycleState, form: FormData) => Promise<EvaluationCycleState>;
};

export function AddCicloForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-[12px] font-medium text-fg">Nome do Ciclo</label>
        <input id="name" name="name" type="text" required placeholder="ex: Avaliação 2026.1" className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="startDate" className="block text-[12px] font-medium text-fg">Início</label>
        <input id="startDate" name="startDate" type="date" required className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="endDate" className="block text-[12px] font-medium text-fg">Fim</label>
        <input id="endDate" name="endDate" type="date" className={INPUT} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Criando…" : "Criar Ciclo"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
