"use client";

import { useActionState } from "react";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type BenefitOption = { id: string; name: string };

type Props = {
  action: (prev: BenefitAssignmentState, form: FormData) => Promise<BenefitAssignmentState>;
  beneficios: BenefitOption[];
};

export function AddBeneficioForm({ action, beneficios }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CampoForm label="Benefício" htmlFor="benefitId" required>
          <Select id="benefitId" name="benefitId" required>
            <option value="">Selecione</option>
            {beneficios.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Início da Vigência" htmlFor="startDate" required>
          <Input id="startDate" name="startDate" type="date" required />
        </CampoForm>
        <CampoForm label="Valor Empresa" htmlFor="companyValue">
          <Input id="companyValue" name="companyValue" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Valor Desconto" htmlFor="discountValue">
          <Input id="discountValue" name="discountValue" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <CampoForm label="Observações" htmlFor="notes">
            <Input id="notes" name="notes" type="text" />
          </CampoForm>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Vinculando…" : "Vincular Benefício"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
