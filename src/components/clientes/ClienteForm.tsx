"use client";

import { useActionState } from "react";
import type { ClienteState } from "@/app/(app)/clientes/actions";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";

export type ClienteDefaultValues = {
  id?: string;
  name?: string;
  cnpjRoot?: string;
  active?: boolean;
};

type Props = {
  action: (prev: ClienteState, form: FormData) => Promise<ClienteState>;
  cancelHref: string;
  defaultValues?: ClienteDefaultValues;
};

export function ClienteForm({ action, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    // Revisão de alinhamento (30/09): o rodapé era [Salvar] [Cancelar] à
    // esquerda — ao contrário de todos os outros formulários; agora é o
    // FormFooter. A raiz do CNPJ (8 dígitos) ganhou coluna do tamanho dela.
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2" role="alert">
          {state.error}
        </p>
      )}

      <FormSection title="Cliente">
        <FieldGrid columns="sm:grid-cols-[1fr_200px]">
          <CampoForm label="Nome" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              type="text"
              required
              maxLength={180}
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Ex: Grupo Aurora"
            />
          </CampoForm>
          <CampoForm
            label="Raiz do CNPJ"
            htmlFor="cnpjRoot"
            helper="Os 8 primeiros dígitos, quando o cliente é um CNPJ com vários estabelecimentos. Opcional."
          >
            <Input
              id="cnpjRoot"
              name="cnpjRoot"
              type="text"
              maxLength={10}
              defaultValue={defaultValues?.cnpjRoot ?? ""}
              placeholder="17122471"
            />
          </CampoForm>
        </FieldGrid>

        <div className="space-y-1">
          <Checkbox id="active" name="active" defaultChecked={defaultValues?.active ?? true} label="Ativo" />
          <p className="text-[length:var(--fs-helper)] text-fg-muted">
            Cliente inativo não aparece no cadastro de empresas novas, mas continua
            respondendo pelas empresas que já tem.
          </p>
        </div>
      </FormSection>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
