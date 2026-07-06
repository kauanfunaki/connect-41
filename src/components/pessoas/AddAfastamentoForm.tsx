"use client";

import { useActionState } from "react";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import { AbsenceType } from "@/generated/prisma/enums";

const TYPE_LABEL: Record<AbsenceType, string> = {
  FALTA:             "Falta",
  ATESTADO_PARCIAL:  "Atestado parcial",
  ATESTADO_INTEGRAL: "Atestado integral",
  LICENCA:           "Licença",
  AFASTAMENTO:       "Afastamento",
  RETORNO:           "Retorno",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as AbsenceType[];

type Props = {
  action: (prev: AbsenceState, form: FormData) => Promise<AbsenceState>;
  canEditMedical: boolean;
};

export function AddAfastamentoForm({ action, canEditMedical }: Props) {
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
        <div className="space-y-1.5">
          <label htmlFor="startDate" className="block text-[12px] font-medium text-fg">Data de Início</label>
          <input id="startDate" name="startDate" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="returnDate" className="block text-[12px] font-medium text-fg">Data de Retorno Prevista</label>
          <input id="returnDate" name="returnDate" type="date" className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="lostDays" className="block text-[12px] font-medium text-fg">Dias Perdidos</label>
          <input id="lostDays" name="lostDays" type="number" min={0} className={`${INPUT} w-24`} />
        </div>
      </div>

      {canEditMedical && (
        <div className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5">
            <label htmlFor="reason" className="block text-[12px] font-medium text-fg">Motivo</label>
            <input id="reason" name="reason" type="text" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="location" className="block text-[12px] font-medium text-fg">Local de Atendimento</label>
            <input id="location" name="location" type="text" className={INPUT} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="professional" className="block text-[12px] font-medium text-fg">Profissional/Conselho</label>
            <input id="professional" name="professional" type="text" className={INPUT} />
          </div>
        </div>
      )}

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
          {isPending ? "Registrando…" : "Registrar Ausência"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
