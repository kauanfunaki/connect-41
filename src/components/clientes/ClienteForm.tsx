"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { ClienteState } from "@/app/(app)/clientes/actions";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";

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
    <form action={formAction} className="flex flex-col gap-5">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[length:var(--fs-helper)] text-danger" role="alert">
          {state.error}
        </p>
      )}

      <FormSection title="Cliente">
        <FieldGrid>
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

        <label className="flex items-center gap-2 text-[length:var(--fs-body)]">
          <Checkbox name="active" defaultChecked={defaultValues?.active ?? true} />
          <span>Ativo</span>
        </label>
        <p className="text-[length:var(--fs-helper)] text-fg-muted">
          Cliente inativo não aparece no cadastro de empresas novas, mas continua
          respondendo pelas empresas que já tem.
        </p>
      </FormSection>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href={cancelHref}>
          <Button type="button" variant="secondary">Cancelar</Button>
        </Link>
      </div>
    </form>
  );
}
