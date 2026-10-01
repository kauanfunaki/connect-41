"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
};

export function AddCompetenciaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Sem margem nem moldura próprias: a página o põe num cartão acima da lista.
  return (
    <form action={formAction} className="space-y-3">
      <FieldGrid columns="sm:grid-cols-[14rem_minmax(0,1fr)_auto]">
        <CampoForm label="Nome da Competência" htmlFor="name" required>
          <Input id="name" name="name" type="text" required />
        </CampoForm>
        <CampoForm label="Descrição" htmlFor="description">
          <Input id="description" name="description" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Cadastrando…" : "Cadastrar"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
