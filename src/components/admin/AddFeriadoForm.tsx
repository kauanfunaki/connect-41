"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { HolidayState } from "@/app/(app)/admin/feriados/actions";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";

type Props = {
  action: (prev: HolidayState, form: FormData) => Promise<HolidayState>;
};

export function AddFeriadoForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Sem margem nem moldura próprias: a página o põe no cartão da importação.
  return (
    <form action={formAction} className="space-y-3">
      <FieldGrid columns="sm:grid-cols-[180px_minmax(0,22rem)_auto]">
        <CampoForm label="Data" htmlFor="date" required>
          <CampoData id="date" name="date" required />
        </CampoForm>
        <CampoForm label="Nome do Feriado" htmlFor="name" required>
          <Input id="name" name="name" type="text" required />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Cadastrando…" : "Cadastrar Feriado"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
