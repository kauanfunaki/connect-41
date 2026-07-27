"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PessoaState } from "@/app/(app)/pessoas/actions";
import { PersonEmploymentStatus } from "@/generated/prisma/enums";
import { CustomFieldsSection, type CustomFieldInput } from "@/components/shared/CustomFieldsSection";
import { FormSection } from "@/components/ui/FormSection";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
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

// "interno" = colaborador da própria 41 (tem vínculo empregatício e conta de
// acesso). "cliente" = pessoa de uma empresa cliente (contato, sócio,
// responsável) — não tem CTPS, jornada nem folha, e pedir esses campos numa
// mesma tela pra todo mundo era o que deixava os dois cadastros idênticos.
export type PessoaKind = "interno" | "cliente";

const STEP_LABELS: Record<PessoaKind, string[]> = {
  interno: ["Dados pessoais", "Endereço", "Vínculo profissional", "Dados complementares", "Documentos", "Revisão"],
  cliente: ["Dados de contato", "Endereço", "Empresa vinculada", "Informações adicionais", "Documentos", "Revisão"],
};

export type PessoaDefaultValues = {
  id?: string;
  name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  birthDate?: string; // ISO date string YYYY-MM-DD
  currentCompanyId?: string;
  isInternal?: boolean;

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
  // Valor inicial do toggle "Funcionário interno" — pré-marcado quando a
  // pessoa já é interna (edição) ou quando veio de /pessoas/nova?internal=1
  // (criação a partir da aba Internos). Editável no próprio formulário.
  defaultIsInternal?: boolean;
};

// Campos que só existem pra quem tem vínculo empregatício com a 41.
function isEmploymentField(kind: PessoaKind): boolean {
  return kind === "interno";
}

export function PessoaForm({
  action,
  cancelHref,
  defaultValues,
  companies,
  cargos,
  departments,
  canEditSensitive,
  customFields = [],
  defaultIsInternal = false,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState(0);
  // Etapa mais distante já alcançada — permite pular pra frente de volta pra
  // uma etapa já preenchida, mesmo depois de voltar pra uma etapa anterior.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [stepError, setStepError] = useState<number | null>(null);
  const isEditing = Boolean(defaultValues?.id);
  const [isInternal, setIsInternal] = useState(defaultValues?.isInternal ?? defaultIsInternal);
  // O tipo acompanha o toggle: marcar/desmarcar "Funcionário interno" troca o
  // formulário na hora, sem precisar sair e voltar.
  const kind: PessoaKind = isInternal ? "interno" : "cliente";
  const showEmployment = isEmploymentField(kind);
  const stepLabels = STEP_LABELS[kind];

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
  const lastStep = stepLabels.length - 1;

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

  // preventDefault é obrigatório aqui, não decorativo: o clique em "Avançar"
  // dispara o setState, o React aplica a atualização de forma síncrona (evento
  // discreto) e o MESMO nó do DOM passa a ser o botão de submit da última
  // etapa — aí o navegador executa a ação padrão do clique sobre o nó já
  // convertido e envia o formulário. Era isso que fazia o passo 6 (Revisão)
  // piscar e o registro ser criado sem o usuário revisar nada. O `key`
  // distinto nos dois botões (ver navegação, no fim do arquivo) evita a
  // reutilização do nó; o preventDefault cancela a ação padrão de qualquer
  // jeito.
  function next(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
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
      stepLabels.map((label, i): StepStatus => {
        if (i === stepError) return "error";
        if (i === step) return "current";
        if (i <= maxStepReached) return "done";
        return "upcoming";
      }).map((status, i) => ({ label: stepLabels[i], status })),
    [step, stepError, maxStepReached, stepLabels]
  );

  // Autopreenchimento por CEP (ViaCEP), mesma fonte e mesmo gatilho do
  // EmpresaForm: dispara quando o CEP fica com 8 dígitos e não repete a busca
  // pro mesmo CEP. Escreve tanto no nó do form quanto em `values` — este
  // último é o que alimenta os campos e a etapa de Revisão.
  const lastFetchedCepRef = useRef<string | null>(null);

  useEffect(() => {
    const clean = values.zipCode?.replace(/\D/g, "") ?? "";
    if (clean.length !== 8 || clean === lastFetchedCepRef.current) return;
    lastFetchedCepRef.current = clean;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        if (!res.ok) return;
        const d = await res.json();
        if (d.erro || cancelled) return;

        const form = formRef.current;
        if (!form) return;
        const set = (name: string, value: string | undefined) => {
          if (!value) return;
          const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
          if (el) el.value = value;
          setValues((prev) => ({ ...prev, [name]: value }));
        };

        set("addressStreet", d.logradouro);
        set("neighborhood", d.bairro);
        set("city", d.localidade);
        set("stateCode", d.uf);
      } catch {
        // falha silenciosa — usuário preenche manualmente
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [values.zipCode]);

  const companyLabel = companies.find((c) => c.id === companyId)?.name;
  const cargoLabel = cargos.find((c) => c.id === values.cargoId)?.name;
  const departmentLabel = departments.find((d) => d.id === values.departmentId)?.name;

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <Stepper steps={steps} onStepClick={(i) => i <= maxStepReached && goTo(i)} />

      <form ref={formRef} action={formAction} noValidate onChange={onFormChange} className="px-6 py-5">
        {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}
        <input type="hidden" name="isInternal" value={String(isInternal)} />

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
                <Input id="rg" name="rg" type="text" value={values.rg} placeholder="00.000.000-0" maxLength={14} />
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
            <Checkbox
              id="isInternal-toggle"
              checked={isInternal}
              onChange={(e) => setIsInternal(e.target.checked)}
              label="Funcionário interno (tem conta de acesso ao Connect)"
            />
          </FormSection>
        </div>

        {/* ── 2. Endereço ───────────────────────────────── */}
        {/* Mesmo layout e mesmo autopreenchimento por CEP do formulário de
            Empresa (src/components/empresas/EmpresaForm.tsx) — os dois
            cadastros pedem o mesmo endereço e não havia motivo pra divergir. */}
        <div data-step={1} className={step === 1 ? "" : "hidden"}>
          <FormSection title="Endereço">
            <FieldGrid columns="sm:grid-cols-[200px]">
              <CampoForm label="CEP" htmlFor="zipCode" helper="Preenche Logradouro, Bairro, Cidade e UF automaticamente.">
                <Input id="zipCode" name="zipCode" type="text" value={values.zipCode} placeholder="00000-000" maxLength={9} />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-[1fr_120px]">
              <CampoForm label="Logradouro" htmlFor="addressStreet">
                <Input id="addressStreet" name="addressStreet" type="text" value={values.addressStreet} placeholder="Rua / Av. / Estrada…" />
              </CampoForm>
              <CampoForm label="Número" htmlFor="addressNumber">
                <Input id="addressNumber" name="addressNumber" type="text" value={values.addressNumber} placeholder="123" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Complemento" htmlFor="addressComplement">
                <Input id="addressComplement" name="addressComplement" type="text" value={values.addressComplement} placeholder="Apto, bloco, casa…" />
              </CampoForm>
              <CampoForm label="Bairro" htmlFor="neighborhood">
                <Input id="neighborhood" name="neighborhood" type="text" value={values.neighborhood} placeholder="Bairro" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="sm:grid-cols-[1fr_80px]">
              <CampoForm label="Cidade" htmlFor="city">
                <Input id="city" name="city" type="text" value={values.city} placeholder="Curitiba" />
              </CampoForm>
              <CampoForm label="UF" htmlFor="stateCode">
                <Input id="stateCode" name="stateCode" type="text" value={values.stateCode} placeholder="PR" maxLength={2} className="uppercase" />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 3. Vínculo profissional / Empresa vinculada ── */}
        <div data-step={2} className={step === 2 ? "" : "hidden"}>
          <FormSection title={stepLabels[2]}>
            {!showEmployment && (
              <p className="text-[length:var(--fs-helper)] text-fg-muted">
                Para contatos de empresas clientes, guardamos só a empresa, o cargo e o departamento —
                jornada, admissão e folha só existem para colaboradores internos.
              </p>
            )}
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
            {showEmployment && (
              <>
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
              </>
            )}
          </FormSection>
        </div>

        {/* ── 4. Dados complementares ────────────────────── */}
        <div data-step={3} className={step === 3 ? "" : "hidden"}>
          <FormSection title={stepLabels[3]}>
            {showEmployment ? (
              <>
                <FieldGrid columns="sm:grid-cols-3">
                  <CampoForm label="Escolaridade" htmlFor="education">
                    <Input id="education" name="education" type="text" value={values.education} placeholder="ex: Ensino superior completo" />
                  </CampoForm>
                  <CampoForm label="PIS" htmlFor="pis">
                    <Input id="pis" name="pis" type="text" value={values.pis} placeholder="000.00000.00-0" />
                  </CampoForm>
                  <CampoForm label="CTPS" htmlFor="ctps">
                    <Input id="ctps" name="ctps" type="text" value={values.ctps} placeholder="0000000" />
                  </CampoForm>
                </FieldGrid>
                <FieldGrid>
                  <CampoForm label="CTPS Série" htmlFor="ctpsSerie">
                    <Input id="ctpsSerie" name="ctpsSerie" type="text" value={values.ctpsSerie} placeholder="000-0" />
                  </CampoForm>
                </FieldGrid>
              </>
            ) : (
              <FieldGrid>
                <CampoForm label="Escolaridade" htmlFor="education">
                  <Input id="education" name="education" type="text" value={values.education} placeholder="ex: Ensino superior completo" />
                </CampoForm>
              </FieldGrid>
            )}

            <CampoForm
              label="Observações"
              htmlFor="notes"
              helper={
                showEmployment
                  ? "Anotações livres sobre o colaborador — visível só internamente."
                  : "Anotações livres sobre o contato — visível só internamente."
              }
            >
              <Textarea id="notes" name="notes" rows={3} value={values.notes} />
            </CampoForm>

            {!showEmployment ? null : canEditSensitive ? (
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

            {showEmployment && (
              <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
                Benefícios são gerenciados na ficha do colaborador depois de criada.
              </p>
            )}

            <CustomFieldsSection fields={customFields} />
          </FormSection>
        </div>

        {/* ── 5. Documentos ──────────────────────────────── */}
        <div data-step={4} className={step === 4 ? "" : "hidden"}>
          <FormSection title={stepLabels[4]}>
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
              title={stepLabels[2]}
              onEdit={() => goTo(2)}
              items={
                showEmployment
                  ? [
                      { label: "Empresa", value: companyLabel },
                      { label: "Cargo", value: cargoLabel },
                      { label: "Departamento", value: departmentLabel },
                      { label: "Status", value: STATUS_LABEL[values.employmentStatus as PersonEmploymentStatus] },
                      { label: "Admissão", value: values.admissionDate },
                      { label: "Jornada", value: values.workShift },
                    ]
                  : [
                      { label: "Empresa", value: companyLabel },
                      { label: "Cargo", value: cargoLabel },
                      { label: "Departamento", value: departmentLabel },
                    ]
              }
            />
            <ReviewBlock
              title={stepLabels[3]}
              onEdit={() => goTo(3)}
              items={
                showEmployment
                  ? [
                      { label: "Escolaridade", value: values.education },
                      { label: "PIS", value: values.pis },
                      { label: "CTPS", value: values.ctps },
                      { label: "Observações", value: values.notes },
                    ]
                  : [
                      { label: "Escolaridade", value: values.education },
                      { label: "Observações", value: values.notes },
                    ]
              }
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
              <Button key="next" type="button" onClick={next}>
                Avançar →
              </Button>
            ) : (
              <Button key="submit" type="submit" loading={isPending}>
                Confirmar e salvar
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
