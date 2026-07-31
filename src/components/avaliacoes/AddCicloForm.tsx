"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { EvaluationCycleState } from "@/app/(app)/avaliacoes/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: EvaluationCycleState, form: FormData) => Promise<EvaluationCycleState>;
};

export function AddCicloForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <div className="w-56">
        <CampoForm label="Nome do Ciclo" htmlFor="name" required>
          <Input id="name" name="name" type="text" required placeholder="ex: Avaliação 2026.1" />
        </CampoForm>
      </div>
      <div className="w-40">
        <CampoForm label="Início" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required />
        </CampoForm>
      </div>
      <div className="w-40">
        <CampoForm label="Fim" htmlFor="endDate">
          <Input id="endDate" name="endDate" type="date" />
        </CampoForm>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        {isPending ? "Criando…" : "Criar Ciclo"}
     </Button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
