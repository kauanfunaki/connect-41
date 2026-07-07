"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PessoaState } from "@/app/(app)/pessoas/actions";
import { PersonEmploymentStatus } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";

const STATUS_OPTIONS: { value: PersonEmploymentStatus; label: string }[] = [
  { value: "ADMISSAO_EM_ANDAMENTO", label: "Admissão em andamento" },
  { value: "ATIVO",                 label: "Ativo" },
  { value: "EM_FERIAS",             label: "Em férias" },
  { value: "AFASTADO",              label: "Afastado" },
  { value: "DESLIGADO",             label: "Desligado" },
];

export type PessoaDefaultValues = {
  id?: string;
  name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  birthDate?: string; // ISO date string YYYY-MM-DD
  currentCompanyId?: string;

  rg?: string;
  pis?: string;
  ctps?: string;
  ctpsSerie?: string;
  education?: string;
  admissionDate?: string;
  dismissalDate?: string;
  employmentStatus?: PersonEmploymentStatus;
  cargoId?: string;
  departmentId?: string;
  monthlyWorkHours?: string;
  weeklyWorkHours?: string;
  workShift?: string;

  zipCode?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressComplement?: string;
  neighborhood?: string;
  city?: string;
  stateCode?: string;

  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;
  bankAccountType?: string;
  currentSalary?: string;
};

type CompanyOption = { id: string; name: string };
type CargoOption = { id: string; name: string; companyId: string };
type DepartmentOption = { id: string; name: string; companyId: string };

type Props = {
  action: (prev: PessoaState, form: FormData) => Promise<PessoaState>;
  cancelHref: string;
  defaultValues?: PessoaDefaultValues;
  companies: CompanyOption[];
  cargos: CargoOption[];
  departments: DepartmentOption[];
  canEditSensitive: boolean;
  customFields?: CustomFieldInput[];
};

export function PessoaForm({
  action,
  cancelHref,
  defaultValues,
  companies,
  cargos,
  departments,
  canEditSensitive,
  customFields = [],
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [companyId, setCompanyId] = useState(defaultValues?.currentCompanyId ?? "");

  const cargosDaEmpresa = cargos.filter((c) => c.companyId === companyId);
  const departamentosDaEmpresa = departments.filter((d) => d.companyId === companyId);

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
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Field label="Data de Nascimento" htmlFor="birthDate">
            <input
              id="birthDate"
              name="birthDate"
              type="date"
              defaultValue={defaultValues?.birthDate ?? ""}
              className={INPUT}
            />
          </Field>
          <Field label="RG" htmlFor="rg">
            <input id="rg" name="rg" type="text" defaultValue={defaultValues?.rg ?? ""} className={INPUT} />
          </Field>
          <Field label="PIS" htmlFor="pis">
            <input id="pis" name="pis" type="text" defaultValue={defaultValues?.pis ?? ""} className={INPUT} />
          </Field>
          <Field label="Escolaridade" htmlFor="education">
            <input id="education" name="education" type="text" defaultValue={defaultValues?.education ?? ""} className={INPUT} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CTPS" htmlFor="ctps">
            <input id="ctps" name="ctps" type="text" defaultValue={defaultValues?.ctps ?? ""} className={INPUT} />
          </Field>
          <Field label="CTPS Série" htmlFor="ctpsSerie">
            <input id="ctpsSerie" name="ctpsSerie" type="text" defaultValue={defaultValues?.ctpsSerie ?? ""} className={INPUT} />
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

      {/* ── Endereço ──────────────────────────────────── */}
      <Section title="Endereço">
        <div className="grid grid-cols-3 gap-4">
          <Field label="CEP" htmlFor="zipCode">
            <input id="zipCode" name="zipCode" type="text" defaultValue={defaultValues?.zipCode ?? ""} className={INPUT} />
          </Field>
          <Field label="Logradouro" htmlFor="addressStreet">
            <input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} className={INPUT} />
          </Field>
          <Field label="Número" htmlFor="addressNumber">
            <input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} className={INPUT} />
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Complemento" htmlFor="addressComplement">
            <input id="addressComplement" name="addressComplement" type="text" defaultValue={defaultValues?.addressComplement ?? ""} className={INPUT} />
          </Field>
          <Field label="Bairro" htmlFor="neighborhood">
            <input id="neighborhood" name="neighborhood" type="text" defaultValue={defaultValues?.neighborhood ?? ""} className={INPUT} />
          </Field>
          <Field label="Cidade" htmlFor="city">
            <input id="city" name="city" type="text" defaultValue={defaultValues?.city ?? ""} className={INPUT} />
          </Field>
          <Field label="UF" htmlFor="stateCode">
            <input id="stateCode" name="stateCode" type="text" maxLength={2} defaultValue={defaultValues?.stateCode ?? ""} className={INPUT} />
          </Field>
        </div>
      </Section>

      {/* ── Vínculo ───────────────────────────────────── */}
      <Section title="Vínculo">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Empresa atual" htmlFor="currentCompanyId">
            <select
              id="currentCompanyId"
              name="currentCompanyId"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className={INPUT}
            >
              <option value="">Nenhuma</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Cargo" htmlFor="cargoId">
            <select
              id="cargoId"
              name="cargoId"
              defaultValue={defaultValues?.cargoId ?? ""}
              disabled={!companyId}
              className={INPUT}
            >
              <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
              {cargosDaEmpresa.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Departamento" htmlFor="departmentId">
            <select
              id="departmentId"
              name="departmentId"
              defaultValue={defaultValues?.departmentId ?? ""}
              disabled={!companyId}
              className={INPUT}
            >
              <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
              {departamentosDaEmpresa.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* ── Dados Trabalhistas ────────────────────────── */}
      <Section title="Dados Trabalhistas">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Status" htmlFor="employmentStatus">
            <select
              id="employmentStatus"
              name="employmentStatus"
              defaultValue={defaultValues?.employmentStatus ?? "ADMISSAO_EM_ANDAMENTO"}
              className={INPUT}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Data de Admissão" htmlFor="admissionDate">
            <input id="admissionDate" name="admissionDate" type="date" defaultValue={defaultValues?.admissionDate ?? ""} className={INPUT} />
          </Field>
          <Field label="Data de Demissão" htmlFor="dismissalDate">
            <input id="dismissalDate" name="dismissalDate" type="date" defaultValue={defaultValues?.dismissalDate ?? ""} className={INPUT} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Jornada" htmlFor="workShift">
            <input id="workShift" name="workShift" type="text" placeholder="ex: 08h-18h" defaultValue={defaultValues?.workShift ?? ""} className={INPUT} />
          </Field>
          <Field label="Carga Horária Semanal" htmlFor="weeklyWorkHours">
            <input id="weeklyWorkHours" name="weeklyWorkHours" type="number" step="0.5" defaultValue={defaultValues?.weeklyWorkHours ?? ""} className={INPUT} />
          </Field>
          <Field label="Carga Horária Mensal" htmlFor="monthlyWorkHours">
            <input id="monthlyWorkHours" name="monthlyWorkHours" type="number" step="0.5" defaultValue={defaultValues?.monthlyWorkHours ?? ""} className={INPUT} />
          </Field>
        </div>
      </Section>

      {/* ── Dados Bancários e Salário (sensível) ───────── */}
      {canEditSensitive ? (
        <Section title="Dados Bancários e Salário">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Salário Atual" htmlFor="currentSalary">
              <input id="currentSalary" name="currentSalary" type="number" step="0.01" defaultValue={defaultValues?.currentSalary ?? ""} className={INPUT} />
            </Field>
            <Field label="Banco" htmlFor="bankName">
              <input id="bankName" name="bankName" type="text" defaultValue={defaultValues?.bankName ?? ""} className={INPUT} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Agência" htmlFor="bankAgency">
              <input id="bankAgency" name="bankAgency" type="text" defaultValue={defaultValues?.bankAgency ?? ""} className={INPUT} />
            </Field>
            <Field label="Conta" htmlFor="bankAccount">
              <input id="bankAccount" name="bankAccount" type="text" defaultValue={defaultValues?.bankAccount ?? ""} className={INPUT} />
            </Field>
            <Field label="Tipo de Conta" htmlFor="bankAccountType">
              <input id="bankAccountType" name="bankAccountType" type="text" defaultValue={defaultValues?.bankAccountType ?? ""} className={INPUT} />
            </Field>
          </div>
        </Section>
      ) : (
        <p className="text-[12px] text-fg-muted italic">
          Dados bancários e salário são sensíveis — seu papel não tem permissão para ver ou editar esses campos.
        </p>
      )}

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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
