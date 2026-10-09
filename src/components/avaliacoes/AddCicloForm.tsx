"use client";

import { useActionState, useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { EvaluationCycleState } from "@/app/(app)/avaliacoes/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { FormFooter } from "@/components/ui/FormFooter";
import { Modal } from "@/components/ui/Modal";

type Props = {
  action: (prev: EvaluationCycleState, form: FormData) => Promise<EvaluationCycleState>;
};

/**
 * O botão de criar ciclo, no cabeçalho da tela, e o formulário numa janela
 * (escolha 5A do Kauan, 08/10/2026). Era um formulário aberto no topo da
 * lista, solto, sem cartão — o único desenho assim entre as listas do DP.
 * A ação leva ao ciclo criado; a janela some com a navegação.
 */
export function NovoCiclo({ action }: Props) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <>
      <Button variant="primary" onClick={() => setAberto(true)}>
        <Plus size={14} /> Novo ciclo
      </Button>
      <Modal open={aberto} onClose={() => !isPending && setAberto(false)} title="Novo ciclo de avaliação" maxWidth="max-w-lg">
        <form action={formAction} className="flex flex-col gap-4">
          <CampoForm label="Nome do ciclo" htmlFor={`${id}-nome`} required>
            <Input id={`${id}-nome`} name="name" type="text" required placeholder="ex: Avaliação 2026.1" />
          </CampoForm>
          <FieldGrid columns="sm:grid-cols-2">
            <CampoForm label="Início" htmlFor={`${id}-inicio`} required>
              <CampoData id={`${id}-inicio`} name="startDate" required />
            </CampoForm>
            <CampoForm label="Fim" htmlFor={`${id}-fim`}>
              <CampoData id={`${id}-fim`} name="endDate" />
            </CampoForm>
          </FieldGrid>
          <FormFooter
            pending={isPending}
            submitLabel="Criar ciclo"
            pendingLabel="Criando…"
            onCancel={() => setAberto(false)}
            erro={state?.error}
          />
        </form>
      </Modal>
    </>
  );
}
