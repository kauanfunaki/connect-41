"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { CandidaturaState } from "@/app/(app)/vagas/[id]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: CandidaturaState, form: FormData) => Promise<CandidaturaState>;
  candidatos: PersonOption[];
};

export function AddCandidatoForm({ action, candidatos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
      <div className="w-56">
        <CampoForm label="Candidato" htmlFor="personId" required>
          <Select id="personId" name="personId" required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
      </div>
      <div className="w-48">
        <CampoForm label="Origem" htmlFor="origin">
          <Input id="origin" name="origin" type="text" placeholder="ex: LinkedIn" />
        </CampoForm>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        {isPending ? "Vinculando…" : "Vincular Candidato"}
     </Button>
      {state?.error && (
        <p className="text-[13px] text-danger w-full">{state.error}</p>
      )}
    </form>
  );
}
