"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { EvaluationCycleState } from "@/app/(app)/avaliacoes/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: EvaluationCycleState, form: FormData) => Promise<EvaluationCycleState>;
};

export function AddCicloForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="mb-6 space-y-2">
      {/* Grade em vez de larguras soltas no items-end: as duas datas em
          colunas iguais e o botão alinhado ao controle. */}
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)_170px_170px_auto]" className="lg:justify-start">
        <CampoForm label="Nome do Ciclo" htmlFor="name" required className="sm:col-span-2 lg:col-span-1">
          <Input id="name" name="name" type="text" required placeholder="ex: Avaliação 2026.1" />
        </CampoForm>
        <CampoForm label="Início" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required />
        </CampoForm>
        <CampoForm label="Fim" htmlFor="endDate">
          <Input id="endDate" name="endDate" type="date" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Criando…" : "Criar Ciclo"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
