"use client";

import { useActionState } from "react";
import type { TenantState } from "@/app/(app)/admin/tenant/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

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

      {isSuperAdmin && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
          <CampoForm label="Plano" htmlFor="plan">
            <Input
              id="plan"
              name="plan"
              type="text"
              defaultValue={defaultValues.plan}
            />
          </CampoForm>
          <CampoForm label="Status" htmlFor="active">
            <div className="h-9 flex items-center">
              <Checkbox
                id="active"
                name="active"
                defaultChecked={defaultValues.active}
                label="Tenant ativo"
              />
            </div>
          </CampoForm>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
