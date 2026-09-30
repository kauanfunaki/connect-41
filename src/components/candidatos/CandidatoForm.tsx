"use client";

import { useActionState } from "react";
import type { CandidatoState } from "@/app/(app)/candidatos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { FormFooter } from "@/components/ui/FormFooter";

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

// Campos curtos (data, CPF, RG, CEP, número, UF) em colunas estreitas fixas —
// eram grades de colunas iguais, e a UF de 2 letras ocupava um quarto da tela.
export function CandidatoForm({ action, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div>
        <FormSection title="Identificação">
          <FieldGrid columns="sm:grid-cols-[1fr_180px]">
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
          </FieldGrid>

          <FieldGrid columns="sm:grid-cols-[180px_180px_1fr]">
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
          </FieldGrid>
        </FormSection>

        <FormSection title="Contato">
          <FieldGrid columns="sm:grid-cols-[1fr_220px]">
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
          </FieldGrid>
        </FormSection>

        <FormSection title="Endereço">
          <FieldGrid columns="sm:grid-cols-[140px_1fr_120px]">
            <CampoForm label="CEP" htmlFor="zipCode">
              <Input id="zipCode" name="zipCode" type="text" defaultValue={defaultValues?.zipCode ?? ""} />
            </CampoForm>
            <CampoForm label="Logradouro" htmlFor="addressStreet">
              <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} />
            </CampoForm>
            <CampoForm label="Número" htmlFor="addressNumber">
              <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid columns="sm:grid-cols-[1fr_1fr_1fr_88px]">
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
          </FieldGrid>
        </FormSection>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
