"use client";

import { useActionState } from "react";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import { TerminationType } from "@/generated/prisma/enums";

const TYPE_LABEL: Record<TerminationType, string> = {
  VOLUNTARIO:        "Voluntário",
  INVOLUNTARIO:      "Involuntário",
  TERMINO_CONTRATO:  "Término de contrato",
  EXPERIENCIA:       "Experiência",
  JUSTA_CAUSA:       "Justa causa",
  SEM_JUSTA_CAUSA:   "Sem justa causa",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as TerminationType[];

type Props = {
  action: (prev: TerminationState, form: FormData) => Promise<TerminationState>;
};

export function AddDesligamentoForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="type" className="block text-[12px] font-medium text-fg">Tipo</label>
          <select id="type" name="type" required className={INPUT}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5 flex-1">
          <label htmlFor="reason" className="block text-[12px] font-medium text-fg">Motivo</label>
          <input id="reason" name="reason" type="text" className={INPUT + " w-full"} />
        </div>
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
          {isPending ? "Registrando…" : "Registrar Desligamento"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
