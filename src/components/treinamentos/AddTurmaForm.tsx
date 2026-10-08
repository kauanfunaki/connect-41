"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { TrainingClassState } from "@/app/(app)/treinamentos/[id]/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";

type Props = {
  action: (prev: TrainingClassState, form: FormData) => Promise<TrainingClassState>;
};

export function AddTurmaForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      {/* Bloco do "novo" com nome, acima dos campos — era o botão "Nova turma"
          no fim da linha, sem dizer do que era o formulário (5A, 08/10/2026). */}
      <h3 className="c41-rotulo">Nova turma</h3>
      {/* Era uma fila de larguras soltas (w-40/w-40/w-48) com o botão no
          items-end; agora é grade, com o botão alinhado ao controle. */}
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <CampoForm label="Data" htmlFor="date" required>
          <CampoData id="date" name="date" required />
        </CampoForm>
        <CampoForm label="Turno" htmlFor="shift">
          <Input id="shift" name="shift" type="text" />
        </CampoForm>
        <CampoForm label="Instrutor" htmlFor="instructor">
          <Input id="instructor" name="instructor" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando…" : "Criar turma"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
