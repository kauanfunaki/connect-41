"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import { AbsenceType } from "@/generated/prisma/enums";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
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

  // Revisão de alinhamento (30/09): datas e dias na largura do que cabe
  // neles, e o botão alinhado ao campo do lado.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,180px))_120px]">
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
        <CampoForm label="Retorno previsto" htmlFor="returnDate">
          <Input id="returnDate" name="returnDate" type="date" />
        </CampoForm>
        <CampoForm label="Dias perdidos" htmlFor="lostDays">
          <Input id="lostDays" name="lostDays" type="number" min={0} />
        </CampoForm>
      </FieldGrid>

      {canEditMedical && (
        <FieldGrid columns="sm:grid-cols-3">
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
          <CampoForm label="Local de Atendimento" htmlFor="location">
            <Input id="location" name="location" type="text" />
          </CampoForm>
          <CampoForm label="Profissional/Conselho" htmlFor="professional">
            <Input id="professional" name="professional" type="text" />
          </CampoForm>
        </FieldGrid>
      )}

      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Registrando…" : "Registrar Ausência"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
