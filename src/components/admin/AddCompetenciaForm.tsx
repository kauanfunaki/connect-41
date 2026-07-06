"use client";

import { useActionState } from "react";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";

type Props = {
  action: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
};

export function AddCompetenciaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <div className="space-y-1.5">
        <label htmlFor="name" className="block text-[12px] font-medium text-fg">Nome da Competência</label>
        <input id="name" name="name" type="text" required className={INPUT} />
      </div>
      <div className="space-y-1.5 flex-1">
        <label htmlFor="description" className="block text-[12px] font-medium text-fg">Descrição</label>
        <input id="description" name="description" type="text" className={INPUT + " w-full"} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Cadastrando…" : "Cadastrar"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
