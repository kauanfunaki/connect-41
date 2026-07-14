"use client";

import { useActionState } from "react";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
        <div className="w-40">
          <CampoForm label="Data" htmlFor="date" required>
            <Input id="date" name="date" type="date" required />
          </CampoForm>
        </div>
        <div className="w-48">
          <CampoForm label="Turno" htmlFor="shiftId">
            <Select id="shiftId" name="shiftId">
              <option value="">Nenhum</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <div className="pb-2">
          <Checkbox id="dayOff" name="dayOff" value="true" label="Folga" />
        </div>
        <div className="pb-2">
          <Checkbox id="isHoliday" name="isHoliday" value="true" label="Feriado" />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <CampoForm label="Observações" htmlFor="notes">
            <Input id="notes" name="notes" type="text" />
          </CampoForm>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Adicionando…" : "Adicionar à Escala"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
