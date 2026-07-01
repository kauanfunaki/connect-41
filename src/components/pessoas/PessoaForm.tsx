"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { PessoaState } from "@/app/(app)/pessoas/actions";
import { PersonType } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";

const TYPE_OPTIONS: { value: PersonType; label: string }[] = [
  { value: "CANDIDATO",    label: "Candidato" },
  { value: "COLABORADOR",  label: "Colaborador" },
];

export type PessoaDefaultValues = {
  id?: string;
  name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  birthDate?: string; // ISO date string YYYY-MM-DD
  type?: PersonType;
  currentCompanyId?: string;
};

type CompanyOption = { id: string; name: string };

type Props = {
  action: (prev: PessoaState, form: FormData) => Promise<PessoaState>;
  cancelHref: string;
  defaultValues?: PessoaDefaultValues;
  companies: CompanyOption[];
  customFields?: CustomFieldInput[];
};

export function PessoaForm({ action, cancelHref, defaultValues, companies, customFields = [] }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && (
        <input type="hidden" name="id" value={defaultValues.id} />
      )}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* ── Identificação ─────────────────────────────── */}
      <Section title="Identificação">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome *" htmlFor="name">
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Nome completo"
              className={INPUT}
            />
          </Field>
          <Field label="Tipo" htmlFor="type">
            <select
              id="type"
              name="type"
              defaultValue={defaultValues?.type ?? "CANDIDATO"}
              className={INPUT}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CPF" htmlFor="cpf">
            <input
              id="cpf"
              name="cpf"
              type="text"
              defaultValue={defaultValues?.cpf ?? ""}
              placeholder="000.000.000-00"
              maxLength={14}
              className={INPUT}
            />
          </Field>
          <Field label="Data de Nascimento" htmlFor="birthDate">
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={defaultValues?.birthDate ?? ""}
              className={INPUT}
            />
          </Field>
        </div>
      </Section>

      {/* ── Contato ───────────────────────────────────── */}
      <Section title="Contato">
        <div className="grid grid-cols-2 gap-4">
          <Field label="E-mail" htmlFor="email">
            <input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              placeholder="nome@email.com"
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
              title="Informe um número de telefone válido"
              className={INPUT}
            />
          </Field>
        </div>
      </Section>

      {/* ── Vínculo ───────────────────────────────────── */}
      <Section title="Vínculo">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Empresa atual" htmlFor="currentCompanyId">
            <select
              id="currentCompanyId"
              name="currentCompanyId"
              defaultValue={defaultValues?.currentCompanyId ?? ""}
              className={INPUT}
            >
              <option value="">Nenhuma</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* Campos Adicionais (setoriais) */}
      <CustomFieldsSection fields={customFields} />

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider border-b border-border pb-2">
        {title}
      </h3>
      {children}
    </div>
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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
