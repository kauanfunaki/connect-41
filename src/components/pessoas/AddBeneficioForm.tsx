"use client";

import { useActionState } from "react";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";

type BenefitOption = { id: string; name: string };

type Props = {
  action: (prev: BenefitAssignmentState, form: FormData) => Promise<BenefitAssignmentState>;
  beneficios: BenefitOption[];
};

export function AddBeneficioForm({ action, beneficios }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="benefitId" className="block text-[12px] font-medium text-fg">Benefício</label>
          <select id="benefitId" name="benefitId" required className={INPUT}>
            <option value="">Selecione</option>
            {beneficios.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="startDate" className="block text-[12px] font-medium text-fg">Início da Vigência</label>
          <input id="startDate" name="startDate" type="date" required className={INPUT} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="companyValue" className="block text-[12px] font-medium text-fg">Valor Empresa</label>
          <input id="companyValue" name="companyValue" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="discountValue" className="block text-[12px] font-medium text-fg">Valor Desconto</label>
          <input id="discountValue" name="discountValue" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5 flex-1">
          <label htmlFor="notes" className="block text-[12px] font-medium text-fg">Observações</label>
          <input id="notes" name="notes" type="text" className={INPUT + " w-full"} />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Vinculando…" : "Vincular Benefício"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
