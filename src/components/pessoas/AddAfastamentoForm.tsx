"use client";

import { useActionState } from "react";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import { AbsenceType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CampoForm label="Tipo" htmlFor="type" required>
          <Select id="type" name="type" required>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Data de Início" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required />
        </CampoForm>
        <CampoForm label="Data de Retorno Prevista" htmlFor="returnDate">
          <Input id="returnDate" name="returnDate" type="date" />
        </CampoForm>
        <CampoForm label="Dias Perdidos" htmlFor="lostDays">
          <Input id="lostDays" name="lostDays" type="number" min={0} />
        </CampoForm>
      </div>

      {canEditMedical && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
          <CampoForm label="Local de Atendimento" htmlFor="location">
            <Input id="location" name="location" type="text" />
          </CampoForm>
          <CampoForm label="Profissional/Conselho" htmlFor="professional">
            <Input id="professional" name="professional" type="text" />
          </CampoForm>
        </div>
      )}

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
          {isPending ? "Registrando…" : "Registrar Ausência"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
