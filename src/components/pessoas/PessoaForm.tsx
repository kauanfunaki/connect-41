"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PessoaState } from "@/app/(app)/pessoas/actions";
import { PersonEmploymentStatus } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Stepper, type StepStatus } from "@/components/ui/Stepper";
import { ReviewBlock } from "@/components/ui/ReviewBlock";
import { formatPhone, formatCep } from "@/lib/format";

const STATUS_OPTIONS: { value: PersonEmploymentStatus; label: string }[] = [
  { value: "ADMISSAO_EM_ANDAMENTO", label: "Admissão em andamento" },
  { value: "ATIVO",                 label: "Ativo" },
  { value: "EM_FERIAS",             label: "Em férias" },
  { value: "AFASTADO",              label: "Afastado" },
  { value: "DESLIGADO",             label: "Desligado" },
];

const STATUS_LABEL: Record<PersonEmploymentStatus, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label])
) as Record<PersonEmploymentStatus, string>;

const STEP_LABELS = ["Dados pessoais", "Endereço", "Vínculo profissional", "Dados complementares", "Documentos", "Revisão"];

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
  notes?: string;
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
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  // Etapa mais distante já alcançada — permite pular pra frente de volta pra
  // uma etapa já preenchida, mesmo depois de voltar pra uma etapa anterior.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [stepError, setStepError] = useState<number | null>(null);
  const isEditing = Boolean(defaultValues?.id);

  const [values, setValues] = useState<Record<string, string>>(() => ({
    name: defaultValues?.name ?? "",
    cpf: defaultValues?.cpf ?? "",
    rg: defaultValues?.rg ?? "",
    birthDate: defaultValues?.birthDate ?? "",
    email: defaultValues?.email ?? "",
    phone: defaultValues?.phone ?? "",
    zipCode: defaultValues?.zipCode ?? "",
    addressStreet: defaultValues?.addressStreet ?? "",
    addressNumber: defaultValues?.addressNumber ?? "",
    addressComplement: defaultValues?.addressComplement ?? "",
    neighborhood: defaultValues?.neighborhood ?? "",
    city: defaultValues?.city ?? "",
    stateCode: defaultValues?.stateCode ?? "",
    currentCompanyId: defaultValues?.currentCompanyId ?? "",
    cargoId: defaultValues?.cargoId ?? "",
    departmentId: defaultValues?.departmentId ?? "",
    employmentStatus: defaultValues?.employmentStatus ?? "ADMISSAO_EM_ANDAMENTO",
    admissionDate: defaultValues?.admissionDate ?? "",
    dismissalDate: defaultValues?.dismissalDate ?? "",
    workShift: defaultValues?.workShift ?? "",
    weeklyWorkHours: defaultValues?.weeklyWorkHours ?? "",
    monthlyWorkHours: defaultValues?.monthlyWorkHours ?? "",
    education: defaultValues?.education ?? "",
    notes: defaultValues?.notes ?? "",
    pis: defaultValues?.pis ?? "",
    ctps: defaultValues?.ctps ?? "",
    ctpsSerie: defaultValues?.ctpsSerie ?? "",
    bankName: defaultValues?.bankName ?? "",
    bankAgency: defaultValues?.bankAgency ?? "",
    bankAccount: defaultValues?.bankAccount ?? "",
    bankAccountType: defaultValues?.bankAccountType ?? "",
    currentSalary: defaultValues?.currentSalary ?? "",
  }));

  const companyId = values.currentCompanyId;
  const cargosDaEmpresa = cargos.filter((c) => c.companyId === companyId);
  const departamentosDaEmpresa = departments.filter((d) => d.companyId === companyId);
  const lastStep = STEP_LABELS.length - 1;

  function onFormChange(e: React.FormEvent<HTMLFormElement>) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (!target.name) return;
    setValues((prev) => ({ ...prev, [target.name]: target.value }));
  }

  function validateStep(i: number): boolean {
    const container = formRef.current?.querySelector(`[data-step="${i}"]`);
    if (!container) return true;
    return container.querySelectorAll(":invalid").length === 0;
  }

  function goTo(i: number) {
    setStep(i);
    setStepError(null);
  }

  function next() {
    if (!validateStep(step)) {
      setStepError(step);
      return;
    }
    setStepError(null);
    setStep((s) => {
      const n = Math.min(s + 1, lastStep);
      setMaxStepReached((m) => Math.max(m, n));
      return n;
    });
  }

  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  const steps = useMemo(
    () =>
      STEP_LABELS.map((label, i): StepStatus => {
        if (i === stepError) return "error";
        if (i === step) return "current";
        if (i <= maxStepReached) return "done";
        return "upcoming";
      }).map((status, i) => ({ label: STEP_LABELS[i], status })),
    [step, stepError, maxStepReached]
  );

  const companyLabel = companies.find((c) => c.id === companyId)?.name;
  const cargoLabel = cargos.find((c) => c.id === values.cargoId)?.name;
  const departmentLabel = departments.find((d) => d.id === values.departmentId)?.name;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <Stepper steps={steps} onStepClick={(i) => i <= maxStepReached && goTo(i)} />

      <form ref={formRef} action={formAction} noValidate onChange={onFormChange} className="px-6 py-5">
        {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

        {state?.error && (
          <p className="mb-4 text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        {/* ── 1. Dados pessoais ─────────────────────────── */}
        <div data-step={0} className={step === 0 ? "" : "hidden"}>
          <FormSection title="Dados pessoais">
            <FieldGrid>
              <CampoForm label="Nome" htmlFor="name" required>
                <Input id="name" name="name" type="text" required value={values.name} placeholder="Nome completo" />
              </CampoForm>
              <CampoForm label="CPF" htmlFor="cpf">
                <Input id="cpf" name="cpf" type="text" value={values.cpf} placeholder="000.000.000-00" maxLength={14} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-2">
              <CampoForm label="RG" htmlFor="rg">
                <Input id="rg" name="rg" type="text" value={values.rg} />
              </CampoForm>
              <CampoForm label="Data de Nascimento" htmlFor="birthDate">
                <Input id="birthDate" name="birthDate" type="date" value={values.birthDate} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="E-mail" htmlFor="email">
                <Input id="email" name="email" type="email" value={values.email} placeholder="nome@email.com" />
              </CampoForm>
              <CampoForm label="Telefone" htmlFor="phone">
                <Input
                  id="phone" name="phone" type="tel" value={values.phone}
                  placeholder="(41) 99999-9999" pattern="[\d\s()\-+]{8,20}" maxLength={20}
                  title="Informe um número de telefone válido"
                />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 2. Endereço ───────────────────────────────── */}
        <div data-step={1} className={step === 1 ? "" : "hidden"}>
          <FormSection title="Endereço">
            <FieldGrid columns="sm:grid-cols-[1fr_80px]">
              <CampoForm label="CEP" htmlFor="zipCode">
                <Input id="zipCode" name="zipCode" type="text" value={values.zipCode} />
              </CampoForm>
              <CampoForm label="UF" htmlFor="stateCode">
                <Input id="stateCode" name="stateCode" type="text" maxLength={2} value={values.stateCode} className="uppercase" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-[1fr_120px]">
              <CampoForm label="Logradouro" htmlFor="addressStreet">
                <Input id="addressStreet" name="addressStreet" type="text" value={values.addressStreet} />
              </CampoForm>
              <CampoForm label="Número" htmlFor="addressNumber">
                <Input id="addressNumber" name="addressNumber" type="text" value={values.addressNumber} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Complemento" htmlFor="addressComplement">
                <Input id="addressComplement" name="addressComplement" type="text" value={values.addressComplement} />
              </CampoForm>
              <CampoForm label="Bairro" htmlFor="neighborhood">
                <Input id="neighborhood" name="neighborhood" type="text" value={values.neighborhood} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Cidade" htmlFor="city">
                <Input id="city" name="city" type="text" value={values.city} />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 3. Vínculo profissional ────────────────────── */}
        <div data-step={2} className={step === 2 ? "" : "hidden"}>
          <FormSection title="Vínculo profissional">
            <FieldGrid columns="sm:grid-cols-3">
              <CampoForm label="Empresa" htmlFor="currentCompanyId">
                <Select id="currentCompanyId" name="currentCompanyId" value={values.currentCompanyId}>
                  <option value="">Nenhuma</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Cargo" htmlFor="cargoId">
                <Select id="cargoId" name="cargoId" value={values.cargoId} disabled={!companyId}>
                  <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
                  {cargosDaEmpresa.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Departamento" htmlFor="departmentId">
                <Select id="departmentId" name="departmentId" value={values.departmentId} disabled={!companyId}>
                  <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
                  {departamentosDaEmpresa.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-3">
              <CampoForm label="Status" htmlFor="employmentStatus">
                <Select id="employmentStatus" name="employmentStatus" value={values.employmentStatus}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Data de Admissão" htmlFor="admissionDate">
                <Input id="admissionDate" name="admissionDate" type="date" value={values.admissionDate} />
              </CampoForm>
              <CampoForm label="Data de Demissão" htmlFor="dismissalDate">
                <Input id="dismissalDate" name="dismissalDate" type="date" value={values.dismissalDate} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-3">
              <CampoForm label="Jornada" htmlFor="workShift">
                <Input id="workShift" name="workShift" type="text" placeholder="ex: 08h-18h" value={values.workShift} />
              </CampoForm>
              <CampoForm label="Carga Horária Semanal" htmlFor="weeklyWorkHours">
                <Input id="weeklyWorkHours" name="weeklyWorkHours" type="number" step="0.5" value={values.weeklyWorkHours} />
              </CampoForm>
              <CampoForm label="Carga Horária Mensal" htmlFor="monthlyWorkHours">
                <Input id="monthlyWorkHours" name="monthlyWorkHours" type="number" step="0.5" value={values.monthlyWorkHours} />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 4. Dados complementares ────────────────────── */}
        <div data-step={3} className={step === 3 ? "" : "hidden"}>
          <FormSection title="Dados complementares">
            <FieldGrid columns="sm:grid-cols-3">
              <CampoForm label="Escolaridade" htmlFor="education">
                <Input id="education" name="education" type="text" value={values.education} />
              </CampoForm>
              <CampoForm label="PIS" htmlFor="pis">
                <Input id="pis" name="pis" type="text" value={values.pis} />
              </CampoForm>
              <CampoForm label="CTPS" htmlFor="ctps">
                <Input id="ctps" name="ctps" type="text" value={values.ctps} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="CTPS Série" htmlFor="ctpsSerie">
                <Input id="ctpsSerie" name="ctpsSerie" type="text" value={values.ctpsSerie} />
              </CampoForm>
            </FieldGrid>
            <CampoForm label="Observações" htmlFor="notes" helper="Anotações livres sobre a pessoa — visível só internamente.">
              <Textarea id="notes" name="notes" rows={3} value={values.notes} />
            </CampoForm>

            {canEditSensitive ? (
              <>
                <h4 className="text-[12.5px] font-semibold text-fg-muted uppercase tracking-wider pt-1">
                  Dados bancários e salário
                </h4>
                <FieldGrid>
                  <CampoForm label="Salário Atual" htmlFor="currentSalary">
                    <Input id="currentSalary" name="currentSalary" type="number" step="0.01" value={values.currentSalary} />
                  </CampoForm>
                  <CampoForm label="Banco" htmlFor="bankName">
                    <Input id="bankName" name="bankName" type="text" value={values.bankName} />
                  </CampoForm>
                </FieldGrid>
                <FieldGrid columns="sm:grid-cols-3">
                  <CampoForm label="Agência" htmlFor="bankAgency">
                    <Input id="bankAgency" name="bankAgency" type="text" value={values.bankAgency} />
                  </CampoForm>
                  <CampoForm label="Conta" htmlFor="bankAccount">
                    <Input id="bankAccount" name="bankAccount" type="text" value={values.bankAccount} />
                  </CampoForm>
                  <CampoForm label="Tipo de Conta" htmlFor="bankAccountType">
                    <Input id="bankAccountType" name="bankAccountType" type="text" value={values.bankAccountType} />
                  </CampoForm>
                </FieldGrid>
              </>
            ) : (
              <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
                Dados bancários e salário são sensíveis — seu papel não tem permissão para ver ou editar esses campos.
              </p>
            )}

            {/* TODO: Benefícios e Observações — sem campo correspondente no formulário atual
                (Benefícios já existe como cadastro próprio na ficha da pessoa, após criada). */}
            <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
              Benefícios: gerenciados na ficha da pessoa depois de criada. Observações: ainda não existe campo pra isso.
            </p>

            <CustomFieldsSection fields={customFields} />
          </FormSection>
        </div>

        {/* ── 5. Documentos ──────────────────────────────── */}
        <div data-step={4} className={step === 4 ? "" : "hidden"}>
          <FormSection title="Documentos">
            {isEditing ? (
              <p className="text-[length:var(--fs-body)] text-fg-secondary">
                A lista de documentos e o upload ficam na ficha da pessoa, na aba própria de Documentos.
              </p>
            ) : (
              <p className="text-[length:var(--fs-body)] text-fg-muted italic">
                O upload de documentos fica disponível depois que a pessoa é criada (a etapa final deste
                cadastro salva o registro; o upload é feito em seguida, na ficha da pessoa).
              </p>
            )}
          </FormSection>
        </div>

        {/* ── 6. Revisão e salvar ────────────────────────── */}
        <div data-step={5} className={step === 5 ? "" : "hidden"}>
          <FormSection title="Revisão e salvar">
            <ReviewBlock
              title="Dados pessoais"
              onEdit={() => goTo(0)}
              items={[
                { label: "Nome", value: values.name },
                { label: "CPF", value: values.cpf },
                { label: "RG", value: values.rg },
                { label: "Nascimento", value: values.birthDate },
                { label: "E-mail", value: values.email },
                { label: "Telefone", value: values.phone ? formatPhone(values.phone) : "" },
              ]}
            />
            <ReviewBlock
              title="Endereço"
              onEdit={() => goTo(1)}
              items={[
                { label: "CEP", value: values.zipCode ? formatCep(values.zipCode) : "" },
                { label: "UF", value: values.stateCode },
                { label: "Logradouro", value: values.addressStreet },
                { label: "Número", value: values.addressNumber },
                { label: "Bairro", value: values.neighborhood },
                { label: "Cidade", value: values.city },
              ]}
            />
            <ReviewBlock
              title="Vínculo profissional"
              onEdit={() => goTo(2)}
              items={[
                { label: "Empresa", value: companyLabel },
                { label: "Cargo", value: cargoLabel },
                { label: "Departamento", value: departmentLabel },
                { label: "Status", value: STATUS_LABEL[values.employmentStatus as PersonEmploymentStatus] },
                { label: "Admissão", value: values.admissionDate },
                { label: "Jornada", value: values.workShift },
              ]}
            />
            <ReviewBlock
              title="Dados complementares"
              onEdit={() => goTo(3)}
              items={[
                { label: "Escolaridade", value: values.education },
                { label: "PIS", value: values.pis },
                { label: "CTPS", value: values.ctps },
                { label: "Observações", value: values.notes },
              ]}
            />
          </FormSection>
        </div>

        {/* ── Navegação ──────────────────────────────────── */}
        <div className="flex items-center justify-between pt-6 mt-6 border-t border-border">
          <div>
            {step > 0 && (
              <Button type="button" variant="secondary" onClick={back}>
                ← Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={cancelHref}
              className="h-9 px-4 rounded-[10px] border border-border-strong text-[length:var(--fs-button)] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors inline-flex items-center"
            >
              Cancelar
            </Link>
            {step < lastStep ? (
              <Button type="button" onClick={next}>
                Avançar →
              </Button>
            ) : (
              <Button type="submit" loading={isPending}>
                Confirmar e salvar
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
