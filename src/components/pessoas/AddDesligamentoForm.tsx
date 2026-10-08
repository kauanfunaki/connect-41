"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import { TerminationType } from "@/generated/prisma/enums";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TYPE_LABEL: Record<TerminationType, string> = {
  VOLUNTARIO:        "Voluntário",
  INVOLUNTARIO:      "Involuntário",
  TERMINO_CONTRATO:  "Término de contrato",
  EXPERIENCIA:       "Experiência",
  JUSTA_CAUSA:       "Justa causa",
  SEM_JUSTA_CAUSA:   "Sem justa causa",
  // Sem estes dois, um acordo era registrado como "sem justa causa" e o
  // cálculo geraria multa de FGTS de 40% onde a lei manda 20%.
  ACORDO_484A:       "Acordo entre as partes (art. 484-A)",
  RESCISAO_INDIRETA: "Rescisão indireta",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as TerminationType[];

type Props = {
  action: (prev: TerminationState, form: FormData) => Promise<TerminationState>;
};

export function AddDesligamentoForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): mesma grade dos outros formulários da
  // ficha — tipo e motivo numa linha, observações e botão na outra.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-[260px_1fr]">
        <CampoForm label="Tipo" htmlFor="type" required>
          <Select id="type" name="type" required>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Motivo" htmlFor="reason">
          <Input id="reason" name="reason" type="text" />
        </CampoForm>
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Registrando…" : "Registrar Desligamento"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
