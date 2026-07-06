"use client";

import { useActionState } from "react";
import type { OvertimeState } from "@/app/(app)/pessoas/[id]/horas-extras/actions";
import { DayType } from "@/generated/prisma/enums";

const DAY_TYPE_LABEL: Record<DayType, string> = {
  UTIL:     "Dia útil",
  FOLGA:    "Folga",
  DOMINGO:  "Domingo",
  FERIADO:  "Feriado",
  NOTURNO:  "Noturno",
};
const DAY_TYPE_OPTIONS = Object.keys(DAY_TYPE_LABEL) as DayType[];

type Props = {
  action: (prev: OvertimeState, form: FormData) => Promise<OvertimeState>;
};

export function AddHoraExtraForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="date" className="block text-[12px] font-medium text-fg">Data</label>
          <input id="date" name="date" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="dayType" className="block text-[12px] font-medium text-fg">Tipo de Dia</label>
          <select id="dayType" name="dayType" defaultValue="UTIL" className={INPUT}>
            {DAY_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{DAY_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="owedHours" className="block text-[12px] font-medium text-fg">Horas Devidas</label>
          <input id="owedHours" name="owedHours" type="number" step="0.25" className={`${INPUT} w-24`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="workedHours" className="block text-[12px] font-medium text-fg">Horas Trabalhadas</label>
          <input id="workedHours" name="workedHours" type="number" step="0.25" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="overtimeHours" className="block text-[12px] font-medium text-fg">Horas Extras</label>
          <input id="overtimeHours" name="overtimeHours" type="number" step="0.25" className={`${INPUT} w-24`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="additionalRate" className="block text-[12px] font-medium text-fg">Adicional (%)</label>
          <input id="additionalRate" name="additionalRate" type="number" step="0.01" className={`${INPUT} w-24`} />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5 flex-1">
          <label htmlFor="justification" className="block text-[12px] font-medium text-fg">Justificativa</label>
          <input id="justification" name="justification" type="text" className={INPUT + " w-full"} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Lançando…" : "Lançar Horas"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
