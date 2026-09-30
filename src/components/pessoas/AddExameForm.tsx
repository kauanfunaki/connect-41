"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ExameState } from "@/app/(app)/pessoas/[id]/exames/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: ExameState, form: FormData) => Promise<ExameState>;
};

export function AddExameForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): o botão ficava solto embaixo, à
  // esquerda, e as datas com a largura da clínica. Mesmo desenho dos outros
  // formulários da ficha: campos numa linha, observações e botão na outra.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,180px))]">
        <CampoForm label="Clínica" htmlFor="clinicName" className="sm:col-span-2 lg:col-span-1">
          <Input id="clinicName" name="clinicName" type="text" />
        </CampoForm>
        <CampoForm label="Data Agendada" htmlFor="scheduledAt">
          <Input id="scheduledAt" name="scheduledAt" type="date" />
        </CampoForm>
        <CampoForm label="Prazo do ASO" htmlFor="asoDueDate">
          <Input id="asoDueDate" name="asoDueDate" type="date" />
        </CampoForm>
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Registrando…" : "Solicitar Exame"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
