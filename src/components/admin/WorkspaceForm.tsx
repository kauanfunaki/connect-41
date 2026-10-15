"use client";

import { useActionState } from "react";
import type { WorkspaceState } from "@/app/(app)/admin/workspaces/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type Props = {
  action: (prev: WorkspaceState, form: FormData) => Promise<WorkspaceState>;
  /** Na janela do "+ Novo workspace" (15/10/2026), o Cancelar fecha a janela. */
  onCancel: () => void;
};

/** O cadastro do workspace, na janela do "+ Novo workspace". Criado, vai para a tela dele. */
export function NovoWorkspace({ action, abertaDeInicio = false }: { action: Props["action"]; abertaDeInicio?: boolean }) {
  return (
    <JanelaDeCadastro rotulo="Novo workspace" abertaDeInicio={abertaDeInicio}>
      {(fechar) => <WorkspaceForm action={action} onCancel={fechar} />}
    </JanelaDeCadastro>
  );
}

export function WorkspaceForm({ action, onCancel }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      {/* CNPJ na mesma linha, na largura dele: tem 18 caracteres. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_14rem]">
        <CampoForm label="Nome do cliente" htmlFor="name" required>
          <Input id="name" name="name" type="text" required placeholder="Razão social do cliente" />
        </CampoForm>
        <CampoForm label="CNPJ" htmlFor="cnpj" required>
          <Input id="cnpj" name="cnpj" type="text" required placeholder="00.000.000/0000-00" />
        </CampoForm>
      </FieldGrid>

      <FormFooter
        pending={isPending}
        pendingLabel="Criando…"
        submitLabel="Criar workspace"
        onCancel={onCancel}
      />
    </form>
  );
}
