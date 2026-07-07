"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import type { EmpresaState } from "@/app/(app)/empresas/actions";
import { CompanyStatus } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

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
  branchId?: string;
};

type Props = {
  action: (prev: EmpresaState, form: FormData) => Promise<EmpresaState>;
  cancelHref: string;
  defaultValues?: EmpresaDefaultValues;
  customFields?: CustomFieldInput[];
  branchOptions?: { value: string; label: string }[];
};

export function EmpresaForm({ action, cancelHref, defaultValues, customFields = [], branchOptions = [] }: Props) {
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
    <form ref={formRef} action={formAction} className="space-y-5">
      {defaultValues?.id && (
        <input type="hidden" name="id" value={defaultValues.id} />
      )}

      {state?.error && (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      {/* ── Identificação ─────────────────────────────── */}
      <FormSection title="Identificação">
        <FieldGrid>
          <CampoForm label="CNPJ" htmlFor="cnpj" helper="Ao sair do campo, os dados são preenchidos automaticamente.">
            <div className="relative">
              <Input
                id="cnpj"
                name="cnpj"
                type="text"
                defaultValue={defaultValues?.cnpj ?? ""}
                placeholder="00.000.000/0000-00"
                onBlur={handleCNPJBlur}
              />
              {fetching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-fg-muted animate-pulse">
                  buscando…
                </span>
              )}
            </div>
          </CampoForm>
          <CampoForm label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={defaultValues?.status ?? "ACTIVE"}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </CampoForm>
        </FieldGrid>

        <FieldGrid>
          <CampoForm label="Razão Social" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              type="text"
              required
              defaultValue={defaultValues?.name ?? ""}
              placeholder="Nome jurídico da empresa"
            />
          </CampoForm>
          <CampoForm label="Nome Fantasia" htmlFor="tradeName">
            <Input
              id="tradeName"
              name="tradeName"
              type="text"
              defaultValue={defaultValues?.tradeName ?? ""}
              placeholder="Como é conhecida"
            />
          </CampoForm>
        </FieldGrid>

        <FieldGrid>
          <CampoForm label="Regime Tributário" htmlFor="taxRegime">
            <Select id="taxRegime" name="taxRegime" defaultValue={defaultValues?.taxRegime ?? ""}>
              <option value="">Selecionar…</option>
              {TAX_REGIME_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </CampoForm>
        </FieldGrid>
      </FormSection>

      {/* ── Endereço ──────────────────────────────────── */}
      <FormSection title="Endereço">
        <FieldGrid columns="grid-cols-[1fr_80px]">
          <CampoForm label="CEP" htmlFor="zipCode">
            <Input
              id="zipCode"
              name="zipCode"
              type="text"
              defaultValue={defaultValues?.zipCode ?? ""}
              placeholder="00000-000"
              maxLength={9}
            />
          </CampoForm>
          <CampoForm label="UF" htmlFor="stateCode">
            <Input
              id="stateCode"
              name="stateCode"
              type="text"
              defaultValue={defaultValues?.stateCode ?? ""}
              placeholder="PR"
              maxLength={2}
              className="uppercase"
            />
          </CampoForm>
        </FieldGrid>

        <FieldGrid columns="grid-cols-[1fr_120px]">
          <CampoForm label="Logradouro" htmlFor="addressStreet">
            <Input
              id="addressStreet"
              name="addressStreet"
              type="text"
              defaultValue={defaultValues?.addressStreet ?? ""}
              placeholder="Rua / Av. / Estrada…"
            />
          </CampoForm>
          <CampoForm label="Número" htmlFor="addressNumber">
            <Input
              id="addressNumber"
              name="addressNumber"
              type="text"
              defaultValue={defaultValues?.addressNumber ?? ""}
              placeholder="123"
            />
          </CampoForm>
        </FieldGrid>

        <FieldGrid>
          <CampoForm label="Complemento" htmlFor="addressComplement">
            <Input
              id="addressComplement"
              name="addressComplement"
              type="text"
              defaultValue={defaultValues?.addressComplement ?? ""}
              placeholder="Sala, andar, bloco…"
            />
          </CampoForm>
          <CampoForm label="Bairro" htmlFor="neighborhood">
            <Input
              id="neighborhood"
              name="neighborhood"
              type="text"
              defaultValue={defaultValues?.neighborhood ?? ""}
              placeholder="Bairro"
            />
          </CampoForm>
        </FieldGrid>

        <FieldGrid>
          <CampoForm label="Cidade" htmlFor="city">
            <Input
              id="city"
              name="city"
              type="text"
              defaultValue={defaultValues?.city ?? ""}
              placeholder="Curitiba"
            />
          </CampoForm>
        </FieldGrid>
      </FormSection>

      {/* ── Contato ───────────────────────────────────── */}
      <FormSection title="Contato">
        <FieldGrid>
          <CampoForm label="E-mail" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
              placeholder="contato@empresa.com.br"
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
              title="Informe um número de telefone válido (ex: (41) 99999-9999)"
            />
          </CampoForm>
        </FieldGrid>
        <FieldGrid>
          <CampoForm label="Website" htmlFor="website">
            <Input
              id="website"
              name="website"
              type="url"
              defaultValue={defaultValues?.website ?? ""}
              placeholder="https://empresa.com.br"
            />
          </CampoForm>
        </FieldGrid>
      </FormSection>

      {/* ── Dados Fiscais ─────────────────────────────── */}
      <FormSection title="Dados Fiscais">
        <FieldGrid columns="grid-cols-3">
          <CampoForm label="Inscrição Estadual" htmlFor="stateRegistration">
            <Input
              id="stateRegistration"
              name="stateRegistration"
              type="text"
              defaultValue={defaultValues?.stateRegistration ?? ""}
              placeholder="000.000.000-0"
            />
          </CampoForm>
          <CampoForm label="Inscrição Municipal" htmlFor="municipalRegistration">
            <Input
              id="municipalRegistration"
              name="municipalRegistration"
              type="text"
              defaultValue={defaultValues?.municipalRegistration ?? ""}
              placeholder="000000-0"
            />
          </CampoForm>
          <CampoForm label="NIRE" htmlFor="nire">
            <Input
              id="nire"
              name="nire"
              type="text"
              defaultValue={defaultValues?.nire ?? ""}
              placeholder="41300012345"
            />
          </CampoForm>
        </FieldGrid>
      </FormSection>

      {/* ── CRM ───────────────────────────────────────── */}
      <FormSection title="CRM">
        <FieldGrid>
          <CampoForm label="Origem / Fonte" htmlFor="source">
            <Input
              id="source"
              name="source"
              type="text"
              defaultValue={defaultValues?.source ?? ""}
              placeholder="Indicação, evento, site…"
            />
          </CampoForm>
          {branchOptions.length > 0 && (
            <CampoForm label="Filial" htmlFor="branchId">
              <Select id="branchId" name="branchId" defaultValue={defaultValues?.branchId ?? ""}>
                <option value="">Nenhuma</option>
                {branchOptions.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </Select>
            </CampoForm>
          )}
        </FieldGrid>
      </FormSection>

      {/* Campos Adicionais (setoriais) */}
      <CustomFieldsSection fields={customFields} />

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={isPending}>
          Salvar
        </Button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-[10px] border border-border-strong text-[length:var(--fs-button)] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
