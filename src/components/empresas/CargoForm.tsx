"use client";

import { useActionState } from "react";
import type { CargoState } from "@/app/(app)/empresas/[id]/cargos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormFooter } from "@/components/ui/FormFooter";
import { SENIORITY_ORDER, SENIORITY_LABEL } from "@/lib/cargoMatriz";
import { Aviso } from "@/components/ui/Aviso";

export type CargoDefaultValues = {
  id?: string;
  name?: string;
  area?: string;
  family?: string;
  seniority?: string;
  description?: string;
  technicalRequirements?: string;
  behavioralRequirements?: string;
  salaryRangeMin?: string;
  salaryRangeMid?: string;
  salaryRangeMax?: string;
};

type Props = {
  action: (prev: CargoState, form: FormData) => Promise<CargoState>;
  companyId: string;
  cancelHref: string;
  defaultValues?: CargoDefaultValues;
  /** Famílias já usadas no tenant — sugestão pra não criar variação de grafia. */
  familiasExistentes?: string[];
};

export function CargoForm({ action, companyId, cancelHref, defaultValues, familiasExistentes = [] }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): três seções. A faixa salarial ganhou
  // título próprio e as colunas viraram "Inicial / Intermediária / Final" —
  // "Faixa Salarial Intermediária" não cabia numa coluna de um terço, quebrava
  // em duas linhas e derrubava o campo dela abaixo dos vizinhos.
  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <div>
        <FormSection title="Cargo">
          <FieldGrid>
            <CampoForm label="Nome do cargo" htmlFor="name" required>
              <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
            </CampoForm>
            <CampoForm label="Área" htmlFor="area">
              <Input id="area" name="area" type="text" defaultValue={defaultValues?.area ?? ""} />
            </CampoForm>
          </FieldGrid>

          {/* Família + senioridade formam a trilha de carreira usada pela matriz
              em /cargos-salarios. Ambos opcionais: cargo sem classificação continua
              válido, só cai no grupo "sem família". */}
          <FieldGrid>
            <CampoForm
              label="Família de cargos"
              htmlFor="family"
              helper="Agrupa a mesma trilha em níveis diferentes (ex: Contábil, Fiscal, Atendimento)."
            >
              <CampoComSugestoes
                id="family"
                name="family"
                type="text"
                sugestoes={familiasExistentes}
                defaultValue={defaultValues?.family ?? ""}
                placeholder="ex: Contábil"
              />
            </CampoForm>
            <CampoForm label="Nível de senioridade" htmlFor="seniority">
              <Select id="seniority" name="seniority" defaultValue={defaultValues?.seniority ?? ""}>
                <option value="">Não definido</option>
                {SENIORITY_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SENIORITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>

          <CampoForm label="Descrição" htmlFor="description">
            <Textarea id="description" name="description" rows={2} defaultValue={defaultValues?.description ?? ""} />
          </CampoForm>
        </FormSection>

        <FormSection title="Requisitos">
          <FieldGrid>
            <CampoForm label="Técnicos" htmlFor="technicalRequirements">
              <Textarea id="technicalRequirements" name="technicalRequirements" rows={3} defaultValue={defaultValues?.technicalRequirements ?? ""} />
            </CampoForm>
            <CampoForm label="Comportamentais" htmlFor="behavioralRequirements">
              <Textarea id="behavioralRequirements" name="behavioralRequirements" rows={3} defaultValue={defaultValues?.behavioralRequirements ?? ""} />
            </CampoForm>
          </FieldGrid>
        </FormSection>

        <FormSection title="Faixa salarial">
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Inicial" htmlFor="salaryRangeMin">
              <Input id="salaryRangeMin" name="salaryRangeMin" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMin ?? ""} prefix="R$" placeholder="0,00" />
            </CampoForm>
            <CampoForm label="Intermediária" htmlFor="salaryRangeMid">
              <Input id="salaryRangeMid" name="salaryRangeMid" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMid ?? ""} prefix="R$" placeholder="0,00" />
            </CampoForm>
            <CampoForm label="Final" htmlFor="salaryRangeMax">
              <Input id="salaryRangeMax" name="salaryRangeMax" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMax ?? ""} prefix="R$" placeholder="0,00" />
            </CampoForm>
          </FieldGrid>
        </FormSection>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
