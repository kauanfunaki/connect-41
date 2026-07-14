"use client";

import { useActionState } from "react";
import type { OvertimeState } from "@/app/(app)/pessoas/[id]/horas-extras/actions";
import { DayType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <CampoForm label="Data" htmlFor="date" required>
          <Input id="date" name="date" type="date" required />
        </CampoForm>
        <CampoForm label="Tipo de Dia" htmlFor="dayType">
          <Select id="dayType" name="dayType" defaultValue="UTIL">
            {DAY_TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{DAY_TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Horas Devidas" htmlFor="owedHours">
          <Input id="owedHours" name="owedHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="Horas Trabalhadas" htmlFor="workedHours">
          <Input id="workedHours" name="workedHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="Horas Extras" htmlFor="overtimeHours">
          <Input id="overtimeHours" name="overtimeHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="Adicional" htmlFor="additionalRate">
          <Input id="additionalRate" name="additionalRate" type="number" step="0.01" suffix="%" />
        </CampoForm>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <CampoForm label="Justificativa" htmlFor="justification">
            <Input id="justification" name="justification" type="text" />
          </CampoForm>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Lançando…" : "Lançar Horas"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
