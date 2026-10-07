"use client";

import { useActionState, useState } from "react";
import type { VagaState } from "@/app/(app)/vagas/actions";
import { VagaPrioridade, type VagaContrato, type VagaModalidade } from "@/generated/prisma/enums";
import { CONTRATO_LABEL, MODALIDADE_LABEL } from "@/lib/carreiras/portal";
import { UFS } from "@/lib/ufs";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { FormFooter } from "@/components/ui/FormFooter";

const PRIORITY_OPTIONS: { value: VagaPrioridade; label: string }[] = [
  { value: "BAIXA", label: "Baixa" },
  { value: "MEDIA", label: "Média" },
  { value: "ALTA",  label: "Alta" },
];

export type VagaDefaultValues = {
  id?: string;
  title?: string;
  companyId?: string;
  sectorCode?: string;
  cargoId?: string;
  quantity?: number;
  responsibleUserId?: string;
  priority?: VagaPrioridade;
  notes?: string;
  isPublic?: boolean;
  publicDescription?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  showSalary?: boolean;
  workMode?: VagaModalidade | null;
  contractType?: VagaContrato | null;
  benefits?: string | null;
  /** "AAAA-MM-DD", o formato do CampoData. */
  applicationDeadline?: string | null;
  workCity?: string | null;
  workStateCode?: string | null;
};

type Option = { id: string; name: string };
type CargoOption = { id: string; name: string; companyId: string };
type SectorOption = { value: string; label: string };

type Props = {
  action: (prev: VagaState, form: FormData) => Promise<VagaState>;
  cancelHref: string;
  companies: Option[];
  cargos: CargoOption[];
  users: Option[];
  sectorOptions: SectorOption[];
  defaultValues?: VagaDefaultValues;
};

export function VagaForm({ action, cancelHref, companies, cargos, users, sectorOptions, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [companyId, setCompanyId] = useState(defaultValues?.companyId ?? "");
  const cargosDaEmpresa = cargos.filter((c) => c.companyId === companyId);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[length:var(--fs-ui)] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Dois assuntos, duas seções: o que é da vaga (interno) e o que o
          candidato vê no portal. Eram 18 campos soltos, com os campos curtos
          (quantidade, UF, data) em colunas de meia tela e o rodapé à esquerda. */}
      <div>
        <FormSection title="Dados da vaga">
          <FieldGrid>
            <CampoForm label="Título da Vaga" htmlFor="title" required>
              <Input id="title" name="title" type="text" required defaultValue={defaultValues?.title ?? ""} />
            </CampoForm>
            <CampoForm label="Setor" htmlFor="sectorCode" required>
              <Select id="sectorCode" name="sectorCode" required defaultValue={defaultValues?.sectorCode ?? ""}>
                <option value="">Selecione</option>
                {sectorOptions.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>

          <FieldGrid columns="sm:grid-cols-[1fr_1fr_120px]">
            <CampoForm label="Empresa" htmlFor="companyId" required>
              <Select
                id="companyId"
                name="companyId"
                required
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                <option value="">Selecione</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Cargo" htmlFor="cargoId">
              <Select id="cargoId" name="cargoId" defaultValue={defaultValues?.cargoId ?? ""} disabled={!companyId}>
                <option value="">{companyId ? "Nenhum" : "Selecione uma empresa"}</option>
                {cargosDaEmpresa.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Quantidade" htmlFor="quantity">
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={defaultValues?.quantity ?? 1} />
            </CampoForm>
          </FieldGrid>

          <FieldGrid>
            <CampoForm label="Responsável" htmlFor="responsibleUserId">
              <Select id="responsibleUserId" name="responsibleUserId" defaultValue={defaultValues?.responsibleUserId ?? ""}>
                <option value="">Nenhum</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Prioridade" htmlFor="priority">
              <Select id="priority" name="priority" defaultValue={defaultValues?.priority ?? "MEDIA"}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>

          <CampoForm label="Observações" htmlFor="notes">
            <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
          </CampoForm>
        </FormSection>

        <FormSection title="Portal de vagas">
          <Checkbox
            name="isPublic"
            value="true"
            defaultChecked={defaultValues?.isPublic ?? false}
            label="Publicar no portal de vagas (visível sem login em /carreiras)"
          />
          <CampoForm label="Descrição pública da vaga" htmlFor="publicDescription">
            <Textarea
              id="publicDescription"
              name="publicDescription"
              rows={4}
              defaultValue={defaultValues?.publicDescription ?? ""}
              placeholder="O que o candidato vê no portal — atividades, requisitos, benefícios. Observações acima continuam internas."
            />
          </CampoForm>
          <FieldGrid>
            <CampoForm label="Modalidade" htmlFor="workMode">
              <Select id="workMode" name="workMode" defaultValue={defaultValues?.workMode ?? ""}>
                <option value="">Não informar</option>
                {(Object.keys(MODALIDADE_LABEL) as VagaModalidade[]).map((m) => (
                  <option key={m} value={m}>{MODALIDADE_LABEL[m]}</option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Tipo de contrato" htmlFor="contractType">
              <Select id="contractType" name="contractType" defaultValue={defaultValues?.contractType ?? ""}>
                <option value="">Não informar</option>
                {(Object.keys(CONTRATO_LABEL) as VagaContrato[]).map((c) => (
                  <option key={c} value={c}>{CONTRATO_LABEL[c]}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>
          <FieldGrid>
            <CampoForm label="Salário de" htmlFor="salaryMin" helper="Por mês.">
              <Input id="salaryMin" name="salaryMin" type="text" inputMode="decimal" prefix="R$" defaultValue={defaultValues?.salaryMin ?? ""} placeholder="3.500,00" />
            </CampoForm>
            <CampoForm label="Salário até" htmlFor="salaryMax" helper="Por mês.">
              <Input id="salaryMax" name="salaryMax" type="text" inputMode="decimal" prefix="R$" defaultValue={defaultValues?.salaryMax ?? ""} placeholder="4.500,00" />
            </CampoForm>
          </FieldGrid>
          <Checkbox
            name="showSalary"
            value="true"
            defaultChecked={defaultValues?.showSalary ?? false}
            label="Mostrar a faixa salarial no portal (desmarcado, aparece &quot;A combinar&quot;)"
          />
          <CampoForm label="Benefícios" htmlFor="benefits" helper="Um por linha.">
            <Textarea
              id="benefits"
              name="benefits"
              rows={4}
              defaultValue={defaultValues?.benefits ?? ""}
              placeholder={"Vale-refeição\nPlano de saúde\nHome office às sextas"}
            />
          </CampoForm>
          <FieldGrid columns="sm:grid-cols-[180px_1fr_200px]">
            <CampoForm label="Inscrições até" htmlFor="applicationDeadline" helper="Depois desse dia a vaga sai do portal sozinha.">
              <CampoData id="applicationDeadline" name="applicationDeadline" defaultValue={defaultValues?.applicationDeadline ?? ""} />
            </CampoForm>
            <CampoForm label="Cidade de trabalho" htmlFor="workCity" helper="Em branco, vale a cidade da empresa.">
              <Input id="workCity" name="workCity" type="text" maxLength={80} defaultValue={defaultValues?.workCity ?? ""} />
            </CampoForm>
            <CampoForm label="UF de trabalho" htmlFor="workStateCode">
              <Select id="workStateCode" name="workStateCode" defaultValue={defaultValues?.workStateCode ?? ""}>
                <option value="">Da empresa</option>
                {UFS.map((uf) => (
                  <option key={uf.value} value={uf.value}>{uf.label}</option>
                ))}
              </Select>
            </CampoForm>
          </FieldGrid>
        </FormSection>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
