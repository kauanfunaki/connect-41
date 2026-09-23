"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { VagaState } from "@/app/(app)/vagas/actions";
import { VagaPrioridade, type VagaContrato, type VagaModalidade } from "@/generated/prisma/enums";
import { CONTRATO_LABEL, MODALIDADE_LABEL } from "@/lib/carreiras/portal";
import { UFS } from "@/lib/ufs";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

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
  /** "AAAA-MM-DD", como o <input type="date"> espera. */
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
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      <CampoForm label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaultValues?.notes ?? ""} />
      </CampoForm>

      <div className="border-t border-border pt-4 space-y-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Salário de (R$ por mês)" htmlFor="salaryMin">
            <Input id="salaryMin" name="salaryMin" type="text" inputMode="decimal" defaultValue={defaultValues?.salaryMin ?? ""} placeholder="3.500,00" />
          </CampoForm>
          <CampoForm label="Salário até (R$ por mês)" htmlFor="salaryMax">
            <Input id="salaryMax" name="salaryMax" type="text" inputMode="decimal" defaultValue={defaultValues?.salaryMax ?? ""} placeholder="4.500,00" />
          </CampoForm>
        </div>
        <Checkbox
          name="showSalary"
          value="true"
          defaultChecked={defaultValues?.showSalary ?? false}
          label="Mostrar a faixa salarial no portal (desmarcado, aparece &quot;A combinar&quot;)"
        />
        <CampoForm label="Benefícios (um por linha)" htmlFor="benefits">
          <Textarea
            id="benefits"
            name="benefits"
            rows={4}
            defaultValue={defaultValues?.benefits ?? ""}
            placeholder={"Vale-refeição\nPlano de saúde\nHome office às sextas"}
          />
        </CampoForm>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoForm label="Inscrições até" htmlFor="applicationDeadline" helper="Depois desse dia a vaga sai do portal sozinha.">
            <Input id="applicationDeadline" name="applicationDeadline" type="date" defaultValue={defaultValues?.applicationDeadline ?? ""} />
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
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          variant="primary"
          size="md"
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
        <Link href={cancelHref} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
