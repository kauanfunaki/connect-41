"use client";

import { useActionState } from "react";
import type { TrainingClassState } from "@/app/(app)/treinamentos/[id]/actions";

type Props = {
  action: (prev: TrainingClassState, form: FormData) => Promise<TrainingClassState>;
};

export function AddTurmaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 flex items-end gap-3 flex-wrap">
      <div className="space-y-1.5">
        <label htmlFor="date" className="block text-[12px] font-medium text-fg">Data</label>
        <input id="date" name="date" type="date" required className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="shift" className="block text-[12px] font-medium text-fg">Turno</label>
        <input id="shift" name="shift" type="text" className={INPUT} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="instructor" className="block text-[12px] font-medium text-fg">Instrutor</label>
        <input id="instructor" name="instructor" type="text" className={INPUT} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Criando…" : "Nova Turma"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
