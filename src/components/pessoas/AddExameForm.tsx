"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ExameState } from "@/app/(app)/pessoas/[id]/exames/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: ExameState, form: FormData) => Promise<ExameState>;
};

export function AddExameForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CampoForm label="Clínica" htmlFor="clinicName">
          <Input id="clinicName" name="clinicName" type="text" />
        </CampoForm>
        <CampoForm label="Data Agendada" htmlFor="scheduledAt">
          <Input id="scheduledAt" name="scheduledAt" type="date" />
        </CampoForm>
        <CampoForm label="Prazo do ASO" htmlFor="asoDueDate">
          <Input id="asoDueDate" name="asoDueDate" type="date" />
        </CampoForm>
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        {isPending ? "Registrando…" : "Solicitar Exame"}
     </Button>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
