"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";

type ShiftOption = { id: string; name: string };

type Props = {
  action: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  shifts: ShiftOption[];
};

export function AddEscalaForm({ action, shifts }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): "Folga" e "Feriado" eram acertadas com
  // `pb-2` ao lado dos campos; agora ficam em `AlinhadoAoCampo`, na altura do
  // controle, e o botão alinha com as observações.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,260px)_auto] lg:justify-start">
        <CampoForm label="Data" htmlFor="date" required>
          <CampoData id="date" name="date" required />
        </CampoForm>
        <CampoForm label="Turno" htmlFor="shiftId">
          <Select id="shiftId" name="shiftId">
            <option value="">Nenhum</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </CampoForm>
        <AlinhadoAoCampo>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Checkbox id="dayOff" name="dayOff" value="true" label="Folga" />
            <Checkbox id="isHoliday" name="isHoliday" value="true" label="Feriado" />
          </div>
        </AlinhadoAoCampo>
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adicionando…" : "Adicionar à Escala"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
