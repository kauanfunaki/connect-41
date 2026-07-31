"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
};

export function AddCompetenciaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <div className="w-56">
        <CampoForm label="Nome da Competência" htmlFor="name" required>
          <Input id="name" name="name" type="text" required />
        </CampoForm>
      </div>
      <div className="flex-1 min-w-[200px]">
        <CampoForm label="Descrição" htmlFor="description">
          <Input id="description" name="description" type="text" />
        </CampoForm>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        {isPending ? "Cadastrando…" : "Cadastrar"}
     </Button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
