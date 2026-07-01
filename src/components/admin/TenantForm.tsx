"use client";

import { useActionState } from "react";
import type { TenantState } from "@/app/(app)/admin/tenant/actions";

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

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome *" htmlFor="name">
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues.name}
            className={INPUT}
          />
        </Field>
        <Field label="CNPJ" htmlFor="cnpj">
          <input
            id="cnpj"
            name="cnpj"
            type="text"
            defaultValue={defaultValues.cnpj ?? ""}
            placeholder="00.000.000/0000-00"
            className={INPUT}
          />
        </Field>
      </div>

      <Field label="Slug" htmlFor="slug">
        <input
          id="slug"
          type="text"
          value={defaultValues.slug}
          disabled
          className={`${INPUT} font-mono`}
        />
        <p className="text-[11px] text-fg-muted mt-1">
          Identificador interno do tenant — não pode ser alterado por aqui.
        </p>
      </Field>

      {isSuperAdmin && (
        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
          <Field label="Plano" htmlFor="plan">
            <input
              id="plan"
              name="plan"
              type="text"
              defaultValue={defaultValues.plan}
              className={INPUT}
            />
          </Field>
          <Field label="Status" htmlFor="active">
            <label className="flex items-center gap-2 h-9">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={defaultValues.active}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-[13px] text-fg">Tenant ativo</span>
            </label>
          </Field>
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors disabled:opacity-60";
