"use client";

import { useActionState } from "react";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/admin/JanelaDeCadastro";

type Props = {
  action: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
  /** Fecha a janela quando o cadastro dá certo. */
  onSucesso: () => void;
  onCancelar: () => void;
};

/** O "+ Nova competência" do cabeçalho de /admin/competencias. */
export function NovaCompetencia({ action }: { action: Props["action"] }) {
  return (
    <JanelaDeCadastro rotulo="Nova competência">
      {(fechar) => <AddCompetenciaForm action={action} onSucesso={fechar} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

// Na janela do "+ Nova competência", no cabeçalho da tela (escolha 5A,
// 08/10/2026): o formulário morava aberto num cartão acima da lista.
export function AddCompetenciaForm({ action, onSucesso, onCancelar }: Props) {
  const [state, formAction, isPending] = useActionState(async (anterior: CompetencyState, form: FormData) => {
    const r = await action(anterior, form);
    if (!r) onSucesso();
    return r;
  }, null);

  return (
    <form action={formAction} className="space-y-4">
      <CampoForm label="Nome da competência" htmlFor="name" required>
        <Input id="name" name="name" type="text" required />
      </CampoForm>
      <CampoForm label="Descrição" htmlFor="description">
        <Input id="description" name="description" type="text" />
      </CampoForm>
      <FormFooter
        pending={isPending}
        pendingLabel="Cadastrando…"
        submitLabel="Cadastrar"
        onCancel={onCancelar}
        erro={state?.error}
      />
    </form>
  );
}
