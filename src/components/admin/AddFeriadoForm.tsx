"use client";

import { useActionState } from "react";
import type { HolidayState } from "@/app/(app)/admin/feriados/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/admin/JanelaDeCadastro";

/** O "+ Novo feriado" do cabeçalho de /admin/feriados. */
export function NovoFeriado({ action }: { action: Props["action"] }) {
  return (
    <JanelaDeCadastro rotulo="Novo feriado">
      {(fechar) => <AddFeriadoForm action={action} onSucesso={fechar} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

type Props = {
  action: (prev: HolidayState, form: FormData) => Promise<HolidayState>;
  /** Fecha a janela quando o cadastro dá certo. */
  onSucesso: () => void;
  onCancelar: () => void;
};

// Na janela do "+ Novo feriado", no cabeçalho da tela (escolha 5A, 08/10/2026):
// o formulário morava aberto no topo da lista, no cartão da importação.
export function AddFeriadoForm({ action, onSucesso, onCancelar }: Props) {
  const [state, formAction, isPending] = useActionState(async (anterior: HolidayState, form: FormData) => {
    const r = await action(anterior, form);
    if (!r) onSucesso();
    return r;
  }, null);

  return (
    <form action={formAction} className="space-y-4">
      <FieldGrid columns="sm:grid-cols-[180px_minmax(0,1fr)]">
        <CampoForm label="Data" htmlFor="date" required>
          <CampoData id="date" name="date" required />
        </CampoForm>
        <CampoForm label="Nome do feriado" htmlFor="name" required>
          <Input id="name" name="name" type="text" required />
        </CampoForm>
      </FieldGrid>
      <FormFooter
        pending={isPending}
        pendingLabel="Cadastrando…"
        submitLabel="Cadastrar feriado"
        onCancel={onCancelar}
        erro={state?.error}
      />
    </form>
  );
}
