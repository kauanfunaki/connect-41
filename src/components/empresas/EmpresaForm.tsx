"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import type { EmpresaState } from "@/app/(app)/empresas/actions";
import { CompanyStatus } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED",  label: "Cancelado" },
];

const TAX_REGIME_OPTIONS = [
  "MEI",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "Lucro Arbitrado",
  "Imune / Isento",
];

export type EmpresaDefaultValues = {
  id?: string;
  name?: string;
  tradeName?: string;
  cnpj?: string;
  taxRegime?: string;
  zipCode?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  stateCode?: string;
  stateRegistration?: string;
  municipalRegistration?: string;
  nire?: string;
  email?: string;
  phone?: string;
  website?: string;
  status?: CompanyStatus;
  source?: string;
};

type Props = {
  action: (prev: EmpresaState, form: FormData) => Promise<EmpresaState>;
  cancelHref: string;
  defaultValues?: EmpresaDefaultValues;
  customFields?: CustomFieldInput[];
};

export function EmpresaForm({ action, cancelHref, defaultValues, customFields = [] }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [fetching, setFetching] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleCNPJBlur(e: React.FocusEvent<HTMLInputElement>) {
    const clean = e.target.value.replace(/\D/g, "");
    if (clean.length !== 14) return;

    setFetching(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
      if (!res.ok) return;
      const d = await res.json();

      const form = formRef.current;
      if (!form) return;

      const set = (name: string, value: string | undefined) => {
        if (!value) return;
        const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
        if (el) el.value = value;
      };

      set("name",      d.razao_social);
      set("tradeName", d.nome_fantasia);
      set("zipCode",   d.cep?.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2"));
      set("addressStreet",     d.logradouro);
      set("addressNumber",     d.numero);
      set("addressComplement", d.complemento);
      set("neighborhood",      d.bairro);
      set("city",              d.municipio);
      set("stateCode",         d.uf);
      set("email", d.email);

      // Telefone: BrasilAPI retorna como "41 99999999"
      if (d.ddd_telefone_1) {
        const fone = d.ddd_telefone_1.replace(/\D/g, "");
        if (fone.length >= 8) {
          set("phone", `(${fone.slice(0, 2)}) ${fone.slice(2)}`);
        }
      }

      // Regime tributário a partir dos flags
      if (d.opcao_mei) {
        set("taxRegime", "MEI");
      } else if (d.opcao_simples) {
        set("taxRegime", "Simples Nacional");
      }
    } catch {
      // falha silenciosa — usuário preenche manualmente
    } finally {
      setFetching(false);
    }
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
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
        {/* CNPJ + Status */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="CNPJ" htmlFor="cnpj">
            <div className="relative">
              <input
                id="cnpj"
                name="cnpj"
                type="text"
                defaultValue={defaultValues?.cnpj ?? ""}
                placeholder="00.000.000/0000-00"
                onBlur={handleCNPJBlur}
                className={INPUT}
              />
              {fetching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-fg-muted animate-pulse">
                  buscando…
                </span>
              )}
            </div>
            <p className="text-[11px] text-fg-muted mt-1">
              Ao sair do campo, os dados são preenchidos automaticamente.
            </p>
          </Field>
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={defaultValues?.status ?? "ACTIVE"}
              className={INPUT}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* Razão Social + Nome Fantasia */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Razão Social *" htmlFor="name">
            <input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Nome jurídico da empresa"
              className={INPUT}
            />
          </Field>
          <Field label="Nome Fantasia" htmlFor="tradeName">
            <input
              id="tradeName"
              name="tradeName"
              type="text"
              defaultValue={defaultValues?.tradeName ?? ""}
              placeholder="Como é conhecida"
              className={INPUT}
            />
          </Field>
        </div>

        {/* Regime Tributário */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Regime Tributário" htmlFor="taxRegime">
            <select
              id="taxRegime"
              name="taxRegime"
              defaultValue={defaultValues?.taxRegime ?? ""}
              className={INPUT}
            >
              <option value="">Selecionar…</option>
              {TAX_REGIME_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Endereço ──────────────────────────────────── */}
      <Section title="Endereço">
        {/* CEP + UF */}
        <div className="grid grid-cols-[1fr_80px] gap-4">
          <Field label="CEP" htmlFor="zipCode">
            <input
              id="zipCode"
              name="zipCode"
              type="text"
              defaultValue={defaultValues?.zipCode ?? ""}
              placeholder="00000-000"
              maxLength={9}
              className={INPUT}
            />
          </Field>
          <Field label="UF" htmlFor="stateCode">
            <input
              id="stateCode"
              name="stateCode"
              type="text"
              defaultValue={defaultValues?.stateCode ?? ""}
              placeholder="PR"
              maxLength={2}
              className={`${INPUT} uppercase`}
            />
          </Field>
        </div>

        {/* Logradouro + Número */}
        <div className="grid grid-cols-[1fr_120px] gap-4">
          <Field label="Logradouro" htmlFor="addressStreet">
            <input
              id="addressStreet"
              name="addressStreet"
              type="text"
              defaultValue={defaultValues?.addressStreet ?? ""}
              placeholder="Rua / Av. / Estrada…"
              className={INPUT}
            />
          </Field>
          <Field label="Número" htmlFor="addressNumber">
            <input
              id="addressNumber"
              name="addressNumber"
              type="text"
              defaultValue={defaultValues?.addressNumber ?? ""}
              placeholder="123"
              className={INPUT}
            />
          </Field>
        </div>

        {/* Complemento + Bairro */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Complemento" htmlFor="addressComplement">
            <input
              id="addressComplement"
              name="addressComplement"
              type="text"
              defaultValue={defaultValues?.addressComplement ?? ""}
              placeholder="Sala, andar, bloco…"
              className={INPUT}
            />
          </Field>
          <Field label="Bairro" htmlFor="neighborhood">
            <input
              id="neighborhood"
              name="neighborhood"
              type="text"
              defaultValue={defaultValues?.neighborhood ?? ""}
              placeholder="Bairro"
              className={INPUT}
            />
          </Field>
        </div>

        {/* Cidade */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Cidade" htmlFor="city">
            <input
              id="city"
              name="city"
              type="text"
              defaultValue={defaultValues?.city ?? ""}
              placeholder="Curitiba"
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website" htmlFor="website">
            <input
              id="website"
              name="website"
              type="url"
              defaultValue={defaultValues?.website ?? ""}
              placeholder="https://empresa.com.br"
              className={INPUT}
            />
          </Field>
        </div>
      </Section>

      {/* ── Dados Fiscais ─────────────────────────────── */}
      <Section title="Dados Fiscais">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Inscrição Estadual" htmlFor="stateRegistration">
            <input
              id="stateRegistration"
              name="stateRegistration"
              type="text"
              defaultValue={defaultValues?.stateRegistration ?? ""}
              placeholder="000.000.000-0"
              className={INPUT}
            />
          </Field>
          <Field label="Inscrição Municipal" htmlFor="municipalRegistration">
            <input
              id="municipalRegistration"
              name="municipalRegistration"
              type="text"
              defaultValue={defaultValues?.municipalRegistration ?? ""}
              placeholder="000000-0"
              className={INPUT}
            />
          </Field>
          <Field label="NIRE" htmlFor="nire">
            <input
              id="nire"
              name="nire"
              type="text"
              defaultValue={defaultValues?.nire ?? ""}
              placeholder="41300012345"
              className={INPUT}
            />
          </Field>
        </div>
      </Section>

      {/* ── CRM ───────────────────────────────────────── */}
      <Section title="CRM">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Origem / Fonte" htmlFor="source">
            <input
              id="source"
              name="source"
              type="text"
              defaultValue={defaultValues?.source ?? ""}
              placeholder="Indicação, evento, site…"
              className={INPUT}
            />
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
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
