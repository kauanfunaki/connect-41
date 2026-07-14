"use client";

import { useActionState } from "react";
import type { TrainingParticipantState } from "@/app/(app)/treinamentos/[id]/turmas/[classId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: TrainingParticipantState, form: FormData) => Promise<TrainingParticipantState>;
  candidatos: PersonOption[];
};

export function AddParticipanteForm({ action, candidatos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 flex items-end gap-3 flex-wrap">
      <div className="w-64">
        <CampoForm label="Colaborador" htmlFor="personId" required>
          <Select id="personId" name="personId" required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Adicionando…" : "Adicionar Participante"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
