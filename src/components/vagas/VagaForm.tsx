"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { VagaState } from "@/app/(app)/vagas/actions";
import { VagaPrioridade } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

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
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link href={cancelHref} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
