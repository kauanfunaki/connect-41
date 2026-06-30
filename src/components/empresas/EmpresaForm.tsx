"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { EmpresaState } from "@/app/(app)/empresas/actions";
import { CompanyStatus } from "@/generated/prisma/enums";

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "PROSPECT", label: "Prospecto" },
  { value: "ACTIVE",   label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED",  label: "Cancelado" },
];

type Props = {
  action: (prev: EmpresaState, form: FormData) => Promise<EmpresaState>;
  cancelHref: string;
  defaultValues?: {
    id?: string;
    name?: string;
    cnpj?: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: CompanyStatus;
    source?: string;
  };
};

export function EmpresaForm({ action, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      {defaultValues?.id && (
        <input type="hidden" name="id" value={defaultValues.id} />
      )}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Nome */}
      <Field label="Nome *" htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Razão social ou nome fantasia"
          className={INPUT}
        />
      </Field>

      {/* CNPJ + Status */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="CNPJ" htmlFor="cnpj">
          <input
            id="cnpj"
            name="cnpj"
            type="text"
            defaultValue={defaultValues?.cnpj ?? ""}
            placeholder="00.000.000/0000-00"
            className={INPUT}
          />
        </Field>
        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            defaultValue={defaultValues?.status ?? "PROSPECT"}
            className={INPUT}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Email + Telefone */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="E-mail" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email ?? ""}
            placeholder="contato@empresa.com.br"
            className={INPUT}
          />
        </Field>
        <Field label="Telefone" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={defaultValues?.phone ?? ""}
            placeholder="(41) 99999-9999"
            pattern="[\d\s()\-+]{8,20}"
            maxLength={20}
            title="Informe um número de telefone válido (ex: (41) 99999-9999)"
            className={INPUT}
          />
        </Field>
      </div>

      {/* Endereço */}
      <Field label="Endereço" htmlFor="address">
        <input
          id="address"
          name="address"
          type="text"
          defaultValue={defaultValues?.address ?? ""}
          placeholder="Rua, número, cidade — PR"
          className={INPUT}
        />
      </Field>

      {/* Origem */}
      <Field label="Origem / Fonte" htmlFor="source">
        <input
          id="source"
          name="source"
          type="text"
          defaultValue={defaultValues?.source ?? ""}
          placeholder="Como chegou até nós?"
          className={INPUT}
        />
      </Field>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-[12px] font-medium text-fg"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
