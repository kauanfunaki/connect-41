"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { CargoState } from "@/app/(app)/empresas/[id]/cargos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

export type CargoDefaultValues = {
  id?: string;
  name?: string;
  area?: string;
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
};

export function CargoForm({ action, companyId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Nome do Cargo" htmlFor="name" required>
          <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
        </CampoForm>
        <CampoForm label="Área" htmlFor="area">
          <Input id="area" name="area" type="text" defaultValue={defaultValues?.area ?? ""} />
        </CampoForm>
      </div>

      <CampoForm label="Descrição" htmlFor="description">
        <Textarea id="description" name="description" rows={2} defaultValue={defaultValues?.description ?? ""} />
      </CampoForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Requisitos Técnicos" htmlFor="technicalRequirements">
          <Textarea id="technicalRequirements" name="technicalRequirements" rows={3} defaultValue={defaultValues?.technicalRequirements ?? ""} />
        </CampoForm>
        <CampoForm label="Requisitos Comportamentais" htmlFor="behavioralRequirements">
          <Textarea id="behavioralRequirements" name="behavioralRequirements" rows={3} defaultValue={defaultValues?.behavioralRequirements ?? ""} />
        </CampoForm>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CampoForm label="Faixa Salarial Inicial" htmlFor="salaryRangeMin">
          <Input id="salaryRangeMin" name="salaryRangeMin" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMin ?? ""} prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Faixa Salarial Intermediária" htmlFor="salaryRangeMid">
          <Input id="salaryRangeMid" name="salaryRangeMid" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMid ?? ""} prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Faixa Salarial Final" htmlFor="salaryRangeMax">
          <Input id="salaryRangeMax" name="salaryRangeMax" type="number" step="0.01" defaultValue={defaultValues?.salaryRangeMax ?? ""} prefix="R$" placeholder="0,00" />
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
