"use client";

import { useActionState } from "react";
import type { TrainingClassState } from "@/app/(app)/treinamentos/[id]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: TrainingClassState, form: FormData) => Promise<TrainingClassState>;
};

export function AddTurmaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 flex items-end gap-3 flex-wrap">
      <div className="w-40">
        <CampoForm label="Data" htmlFor="date" required>
          <Input id="date" name="date" type="date" required />
        </CampoForm>
      </div>
      <div className="w-40">
        <CampoForm label="Turno" htmlFor="shift">
          <Input id="shift" name="shift" type="text" />
        </CampoForm>
      </div>
      <div className="w-48">
        <CampoForm label="Instrutor" htmlFor="instructor">
          <Input id="instructor" name="instructor" type="text" />
        </CampoForm>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Criando…" : "Nova Turma"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
