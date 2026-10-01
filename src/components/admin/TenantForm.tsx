"use client";

import { useActionState } from "react";
import type { TenantState } from "@/app/(app)/admin/tenant/actions";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Props = {
  action: (prev: TenantState, form: FormData) => Promise<TenantState>;
  isSuperAdmin: boolean;
  defaultValues: {
    name: string;
    cnpj?: string;
    slug: string;
    plan: string;
    active: boolean;
  };
};

export function TenantForm({ action, isSuperAdmin, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {state && "error" in state && state.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}
      {state && "success" in state && state.success && (
        <p className="text-[13px] text-success bg-success/8 border border-success/20 rounded-md px-3 py-2">
          Dados atualizados.
        </p>
      )}

      {/* CNPJ na largura dele (18 caracteres); o slug fica embaixo, na mesma
          coluna do nome. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_14rem]">
        <CampoForm label="Nome" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues.name}
          />
        </CampoForm>
        <CampoForm label="CNPJ" htmlFor="cnpj">
          <Input
            id="cnpj"
            name="cnpj"
            type="text"
            defaultValue={defaultValues.cnpj ?? ""}
            placeholder="00.000.000/0000-00"
          />
        </CampoForm>
        <CampoForm
          label="Slug"
          htmlFor="slug"
          helper="Identificador interno do tenant — não pode ser alterado por aqui."
        >
          <Input
            id="slug"
            type="text"
            value={defaultValues.slug}
            disabled
            className="font-mono"
          />
        </CampoForm>
      </FieldGrid>

      {isSuperAdmin && (
        <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_14rem]" className="border-t border-border pt-4">
          <CampoForm label="Plano" htmlFor="plan">
            <Input
              id="plan"
              name="plan"
              type="text"
              defaultValue={defaultValues.plan}
            />
          </CampoForm>
          <AlinhadoAoCampo>
            <Checkbox
              id="active"
              name="active"
              defaultChecked={defaultValues.active}
              label="Tenant ativo"
            />
          </AlinhadoAoCampo>
        </FieldGrid>
      )}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
