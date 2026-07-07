"use client";

import { useActionState } from "react";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";

type ShiftOption = { id: string; name: string };

type Props = {
  action: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  shifts: ShiftOption[];
};

export function AddEscalaForm({ action, shifts }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="date" className="block text-[12px] font-medium text-fg">Data</label>
          <input id="date" name="date" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="shiftId" className="block text-[12px] font-medium text-fg">Turno</label>
          <select id="shiftId" name="shiftId" className={INPUT}>
            <option value="">Nenhum</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary pb-2">
          <input type="checkbox" name="dayOff" value="true" /> Folga
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-secondary pb-2">
          <input type="checkbox" name="isHoliday" value="true" /> Feriado
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
          {isPending ? "Adicionando…" : "Adicionar à Escala"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
