"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { TrainingParticipantState } from "@/app/(app)/treinamentos/[id]/turmas/[classId]/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: TrainingParticipantState, form: FormData) => Promise<TrainingParticipantState>;
  candidatos: PersonOption[];
};

export function AddParticipanteForm({ action, candidatos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      {/* Bloco do "novo" com nome, acima do campo (5A, 08/10/2026). */}
      <h3 className="c41-rotulo">Novo participante</h3>
      {/* Mesmo desenho do "Avaliar colaborador" do ciclo: escolha + ação na
          mesma linha, o botão alinhado ao controle e não ao rótulo. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]" className="max-w-xl">
        <CampoForm label="Colaborador" htmlFor="personId" required>
          <Select id="personId" name="personId" required>
            <option value="">Selecione</option>
            {candidatos.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Adicionando…" : "Adicionar participante"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
