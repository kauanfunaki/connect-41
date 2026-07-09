"use client";

import { useActionState, useMemo, useRef, useState } from "react";
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
import { Stepper, type StepStatus } from "@/components/ui/Stepper";
import { ReviewBlock } from "@/components/ui/ReviewBlock";

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Ativo" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED",  label: "Cancelado" },
];

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto", ACTIVE: "Ativo", INACTIVE: "Inativo", CHURNED: "Cancelado",
};

const TAX_REGIME_OPTIONS = [
  "MEI",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "Lucro Arbitrado",
  "Imune / Isento",
];

const STEP_LABELS = ["Identificação", "Endereço", "Contato", "Dados fiscais", "Responsáveis", "Revisão"];

export type EmpresaDefaultValues = {
  id?: string;
  name?: string;
  tradeName?: string;
  cnpj?: string;
  taxRegime?: string;
  externalId?: string;
  foundationDate?: string;
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
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>(() => ({
    cnpj: defaultValues?.cnpj ?? "",
    status: defaultValues?.status ?? "ACTIVE",
    name: defaultValues?.name ?? "",
    tradeName: defaultValues?.tradeName ?? "",
    taxRegime: defaultValues?.taxRegime ?? "",
    externalId: defaultValues?.externalId ?? "",
    foundationDate: defaultValues?.foundationDate ?? "",
    zipCode: defaultValues?.zipCode ?? "",
    stateCode: defaultValues?.stateCode ?? "",
    addressStreet: defaultValues?.addressStreet ?? "",
    addressNumber: defaultValues?.addressNumber ?? "",
    addressComplement: defaultValues?.addressComplement ?? "",
    neighborhood: defaultValues?.neighborhood ?? "",
    city: defaultValues?.city ?? "",
    email: defaultValues?.email ?? "",
    phone: defaultValues?.phone ?? "",
    website: defaultValues?.website ?? "",
    stateRegistration: defaultValues?.stateRegistration ?? "",
    municipalRegistration: defaultValues?.municipalRegistration ?? "",
    nire: defaultValues?.nire ?? "",
    source: defaultValues?.source ?? "",
    branchId: defaultValues?.branchId ?? "",
  }));

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
    setStep((s) => Math.min(s + 1, lastStep));
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
        if (i < step) return "done";
        return "upcoming";
      }).map((status, i) => ({ label: STEP_LABELS[i], status })),
    [step, stepError]
  );

  const branchLabel = branchOptions.find((b) => b.value === values.branchId)?.label;

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
        setValues((prev) => ({ ...prev, [name]: value }));
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
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <Stepper steps={steps} onStepClick={(i) => i < step && goTo(i)} />

      <form ref={formRef} action={formAction} noValidate onChange={onFormChange} className="px-6 py-5">
        {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

        {state?.error && (
          <p className="mb-4 text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-lg px-3 py-2">
            {state.error}
          </p>
        )}

        {/* ── 1. Identificação ─────────────────────────── */}
        <div data-step={0} className={step === 0 ? "" : "hidden"}>
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
                <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} placeholder="Nome jurídico da empresa" />
              </CampoForm>
              <CampoForm label="Nome Fantasia" htmlFor="tradeName">
                <Input id="tradeName" name="tradeName" type="text" defaultValue={defaultValues?.tradeName ?? ""} placeholder="Como é conhecida" />
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
              <CampoForm label="ID" htmlFor="externalId" helper="Referência manual (ex: ID do Acessorias) — sem sincronização automática.">
                <Input id="externalId" name="externalId" type="text" defaultValue={defaultValues?.externalId ?? ""} placeholder="Ex: 12345" />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 2. Endereço ───────────────────────────────── */}
        <div data-step={1} className={step === 1 ? "" : "hidden"}>
          <FormSection title="Endereço">
            <FieldGrid columns="grid-cols-[1fr_80px]">
              <CampoForm label="CEP" htmlFor="zipCode">
                <Input id="zipCode" name="zipCode" type="text" defaultValue={defaultValues?.zipCode ?? ""} placeholder="00000-000" maxLength={9} />
              </CampoForm>
              <CampoForm label="UF" htmlFor="stateCode">
                <Input id="stateCode" name="stateCode" type="text" defaultValue={defaultValues?.stateCode ?? ""} placeholder="PR" maxLength={2} className="uppercase" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="grid-cols-[1fr_120px]">
              <CampoForm label="Logradouro" htmlFor="addressStreet">
                <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} placeholder="Rua / Av. / Estrada…" />
              </CampoForm>
              <CampoForm label="Número" htmlFor="addressNumber">
                <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} placeholder="123" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Complemento" htmlFor="addressComplement">
                <Input id="addressComplement" name="addressComplement" type="text" defaultValue={defaultValues?.addressComplement ?? ""} placeholder="Sala, andar, bloco…" />
              </CampoForm>
              <CampoForm label="Bairro" htmlFor="neighborhood">
                <Input id="neighborhood" name="neighborhood" type="text" defaultValue={defaultValues?.neighborhood ?? ""} placeholder="Bairro" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Cidade" htmlFor="city">
                <Input id="city" name="city" type="text" defaultValue={defaultValues?.city ?? ""} placeholder="Curitiba" />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 3. Contato ────────────────────────────────── */}
        <div data-step={2} className={step === 2 ? "" : "hidden"}>
          <FormSection title="Contato">
            <FieldGrid>
              <CampoForm label="E-mail" htmlFor="email">
                <Input id="email" name="email" type="email" defaultValue={defaultValues?.email ?? ""} placeholder="contato@empresa.com.br" />
              </CampoForm>
              <CampoForm label="Telefone" htmlFor="phone">
                <Input
                  id="phone" name="phone" type="tel" defaultValue={defaultValues?.phone ?? ""}
                  placeholder="(41) 99999-9999" pattern="[\d\s()\-+]{8,20}" maxLength={20}
                  title="Informe um número de telefone válido (ex: (41) 99999-9999)"
                />
              </CampoForm>
            </FieldGrid>
            <FieldGrid>
              <CampoForm label="Website" htmlFor="website">
                <Input id="website" name="website" type="url" defaultValue={defaultValues?.website ?? ""} placeholder="https://empresa.com.br" />
              </CampoForm>
            </FieldGrid>
          </FormSection>
        </div>

        {/* ── 4. Dados fiscais ──────────────────────────── */}
        <div data-step={3} className={step === 3 ? "" : "hidden"}>
          <FormSection title="Dados fiscais">
            <FieldGrid columns="grid-cols-3">
              <CampoForm label="Inscrição Estadual" htmlFor="stateRegistration">
                <Input id="stateRegistration" name="stateRegistration" type="text" defaultValue={defaultValues?.stateRegistration ?? ""} placeholder="000.000.000-0" />
              </CampoForm>
              <CampoForm label="Inscrição Municipal" htmlFor="municipalRegistration">
                <Input id="municipalRegistration" name="municipalRegistration" type="text" defaultValue={defaultValues?.municipalRegistration ?? ""} placeholder="000000-0" />
              </CampoForm>
              <CampoForm label="NIRE" htmlFor="nire">
                <Input id="nire" name="nire" type="text" defaultValue={defaultValues?.nire ?? ""} placeholder="41300012345" />
              </CampoForm>
            </FieldGrid>
            <FieldGrid columns="grid-cols-3">
              <CampoForm label="Data de Abertura" htmlFor="foundationDate">
                <Input id="foundationDate" name="foundationDate" type="date" defaultValue={defaultValues?.foundationDate ?? ""} />
              </CampoForm>
            </FieldGrid>
            {/* TODO: CNAE principal/secundários — sem campo correspondente no schema atual (Company). */}
            <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
              CNAE principal e secundários: ainda não existe campo pra isso no cadastro — pendente de modelagem.
            </p>
          </FormSection>
        </div>

        {/* ── 5. Responsáveis e vínculos ────────────────── */}
        <div data-step={4} className={step === 4 ? "" : "hidden"}>
          <FormSection title="Responsáveis e vínculos">
            <FieldGrid>
              <CampoForm label="Origem / Fonte" htmlFor="source">
                <Input id="source" name="source" type="text" defaultValue={defaultValues?.source ?? ""} placeholder="Indicação, evento, site…" />
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
            {defaultValues?.id ? (
              <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
                Responsável por setor/serviço (Contábil → João, etc.) é gerenciado no card
                &quot;Serviços contratados&quot; da ficha da empresa, não neste formulário.
              </p>
            ) : (
              <p className="text-[length:var(--fs-helper)] text-fg-muted italic">
                Após salvar, adicione os setores contratados e seus responsáveis na ficha da empresa.
              </p>
            )}
            <CustomFieldsSection fields={customFields} />
          </FormSection>
        </div>

        {/* ── 6. Revisão e salvar ───────────────────────── */}
        <div data-step={5} className={step === 5 ? "" : "hidden"}>
          <FormSection title="Revisão e salvar">
            <ReviewBlock
              title="Identificação"
              onEdit={() => goTo(0)}
              items={[
                { label: "CNPJ", value: values.cnpj },
                { label: "Status", value: STATUS_LABEL[values.status as CompanyStatus] },
                { label: "Razão Social", value: values.name },
                { label: "Nome Fantasia", value: values.tradeName },
                { label: "Regime Tributário", value: values.taxRegime },
                { label: "ID", value: values.externalId },
              ]}
            />
            <ReviewBlock
              title="Endereço"
              onEdit={() => goTo(1)}
              items={[
                { label: "CEP", value: values.zipCode },
                { label: "UF", value: values.stateCode },
                { label: "Logradouro", value: values.addressStreet },
                { label: "Número", value: values.addressNumber },
                { label: "Bairro", value: values.neighborhood },
                { label: "Cidade", value: values.city },
              ]}
            />
            <ReviewBlock
              title="Contato"
              onEdit={() => goTo(2)}
              items={[
                { label: "E-mail", value: values.email },
                { label: "Telefone", value: values.phone },
                { label: "Website", value: values.website },
              ]}
            />
            <ReviewBlock
              title="Dados fiscais"
              onEdit={() => goTo(3)}
              items={[
                { label: "Inscrição Estadual", value: values.stateRegistration },
                { label: "Inscrição Municipal", value: values.municipalRegistration },
                { label: "NIRE", value: values.nire },
                { label: "Data de Abertura", value: values.foundationDate },
              ]}
            />
            <ReviewBlock
              title="Responsáveis e vínculos"
              onEdit={() => goTo(4)}
              items={[
                { label: "Origem", value: values.source },
                { label: "Filial", value: branchLabel },
              ]}
            />
          </FormSection>
        </div>

        {/* ── Navegação ──────────────────────────────────── */}
        <div className="flex items-center justify-between pt-4 mt-1 border-t border-border">
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
