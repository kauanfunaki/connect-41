"use client";

import { useActionState } from "react";
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
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Criando…" : "Criar Ciclo"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
