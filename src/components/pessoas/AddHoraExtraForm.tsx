"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { OvertimeState } from "@/app/(app)/pessoas/[id]/horas-extras/actions";
import { DayType } from "@/generated/prisma/enums";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
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

  // Revisão de alinhamento (30/09): botão alinhado ao campo de
  // justificativa, como nos outros formulários da ficha.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-3 lg:grid-cols-6">
        <CampoForm label="Data" htmlFor="date" required>
          <CampoData id="date" name="date" required />
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
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Justificativa" htmlFor="justification">
          <Input id="justification" name="justification" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Lançando…" : "Lançar Horas"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
