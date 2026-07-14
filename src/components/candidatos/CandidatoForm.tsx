"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CandidatoState } from "@/app/(app)/candidatos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

export type CandidatoDefaultValues = {
  id?: string;
  name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  birthDate?: string; // ISO date string YYYY-MM-DD
  rg?: string;
  education?: string;

  zipCode?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  stateCode?: string;
};

type Props = {
  action: (prev: CandidatoState, form: FormData) => Promise<CandidatoState>;
  cancelHref: string;
  defaultValues?: CandidatoDefaultValues;
};

export function CandidatoForm({ action, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* ── Identificação ─────────────────────────────── */}
      <Section title="Identificação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Nome" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Nome completo"
            />
          </CampoForm>
          <CampoForm label="Data de Nascimento" htmlFor="birthDate">
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={defaultValues?.birthDate ?? ""}
            />
          </CampoForm>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoForm label="CPF" htmlFor="cpf">
            <Input
              id="cpf"
              name="cpf"
              type="text"
              defaultValue={defaultValues?.cpf ?? ""}
              placeholder="000.000.000-00"
              maxLength={14}
            />
          </CampoForm>
          <CampoForm label="RG" htmlFor="rg">
            <Input id="rg" name="rg" type="text" defaultValue={defaultValues?.rg ?? ""} />
          </CampoForm>
          <CampoForm label="Escolaridade" htmlFor="education">
            <Input id="education" name="education" type="text" defaultValue={defaultValues?.education ?? ""} />
          </CampoForm>
        </div>
      </Section>

      {/* ── Contato ───────────────────────────────────── */}
      <Section title="Contato">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="E-mail" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              placeholder="nome@email.com"
            />
          </CampoForm>
          <CampoForm label="Telefone" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={defaultValues?.phone ?? ""}
              placeholder="(41) 99999-9999"
              pattern="[\d\s()\-+]{8,20}"
              maxLength={20}
              title="Informe um número de telefone válido"
            />
          </CampoForm>
        </div>
      </Section>

      {/* ── Endereço ──────────────────────────────────── */}
      <Section title="Endereço">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoForm label="CEP" htmlFor="zipCode">
            <Input id="zipCode" name="zipCode" type="text" defaultValue={defaultValues?.zipCode ?? ""} />
          </CampoForm>
          <CampoForm label="Logradouro" htmlFor="addressStreet">
            <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} />
          </CampoForm>
          <CampoForm label="Número" htmlFor="addressNumber">
            <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} />
          </CampoForm>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CampoForm label="Complemento" htmlFor="addressComplement">
            <Input id="addressComplement" name="addressComplement" type="text" defaultValue={defaultValues?.addressComplement ?? ""} />
          </CampoForm>
          <CampoForm label="Bairro" htmlFor="neighborhood">
            <Input id="neighborhood" name="neighborhood" type="text" defaultValue={defaultValues?.neighborhood ?? ""} />
          </CampoForm>
          <CampoForm label="Cidade" htmlFor="city">
            <Input id="city" name="city" type="text" defaultValue={defaultValues?.city ?? ""} />
          </CampoForm>
          <CampoForm label="UF" htmlFor="stateCode">
            <Input id="stateCode" name="stateCode" type="text" maxLength={2} defaultValue={defaultValues?.stateCode ?? ""} />
          </CampoForm>
        </div>
      </Section>

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
