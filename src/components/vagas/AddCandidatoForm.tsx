"use client";

import { useActionState } from "react";
import type { CandidaturaState } from "@/app/(app)/vagas/[id]/actions";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: CandidaturaState, form: FormData) => Promise<CandidaturaState>;
  candidatos: PersonOption[];
};

export function AddCandidatoForm({ action, candidatos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
      <div className="space-y-1.5">
        <label htmlFor="personId" className="block text-[12px] font-medium text-fg">Candidato</label>
        <select id="personId" name="personId" required className={INPUT}>
          <option value="">Selecione</option>
          {candidatos.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="origin" className="block text-[12px] font-medium text-fg">Origem</label>
        <input id="origin" name="origin" type="text" placeholder="ex: LinkedIn" className={INPUT} />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Vinculando…" : "Vincular Candidato"}
      </button>
      {state?.error && (
        <p className="text-[13px] text-danger w-full">{state.error}</p>
      )}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
