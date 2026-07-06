"use client";

import { useActionState } from "react";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: PayrollEntryState, form: FormData) => Promise<PayrollEntryState>;
  colaboradores: PersonOption[];
};

export function LancarEventoForm({ action, colaboradores }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="personId" className="block text-[12px] font-medium text-fg">Colaborador</label>
          <select id="personId" name="personId" required className={INPUT}>
            <option value="">Selecione</option>
            {colaboradores.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="grossSalary" className="block text-[12px] font-medium text-fg">Salário Bruto</label>
          <input id="grossSalary" name="grossSalary" type="number" step="0.01" required className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="workedDays" className="block text-[12px] font-medium text-fg">Dias Trabalhados</label>
          <input id="workedDays" name="workedDays" type="number" min={0} max={31} className={`${INPUT} w-24`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="missedDays" className="block text-[12px] font-medium text-fg">Faltas</label>
          <input id="missedDays" name="missedDays" type="number" min={0} className={`${INPUT} w-20`} />
        </div>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="vacationDays" className="block text-[12px] font-medium text-fg">Dias de Férias</label>
          <input id="vacationDays" name="vacationDays" type="number" min={0} className={`${INPUT} w-24`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="absenceDays" className="block text-[12px] font-medium text-fg">Dias de Afastamento</label>
          <input id="absenceDays" name="absenceDays" type="number" min={0} className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="overtimeHours" className="block text-[12px] font-medium text-fg">Horas Extras</label>
          <input id="overtimeHours" name="overtimeHours" type="number" step="0.25" className={`${INPUT} w-24`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="thirteenthSalary" className="block text-[12px] font-medium text-fg">13º Salário</label>
          <input id="thirteenthSalary" name="thirteenthSalary" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="familyAllowance" className="block text-[12px] font-medium text-fg">Salário Família</label>
          <input id="familyAllowance" name="familyAllowance" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="nightShiftAllowance" className="block text-[12px] font-medium text-fg">Adicional Noturno</label>
          <input id="nightShiftAllowance" name="nightShiftAllowance" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hazardPay" className="block text-[12px] font-medium text-fg">Periculosidade</label>
          <input id="hazardPay" name="hazardPay" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="unhealthyPay" className="block text-[12px] font-medium text-fg">Insalubridade</label>
          <input id="unhealthyPay" name="unhealthyPay" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="benefitsTotal" className="block text-[12px] font-medium text-fg">Benefícios</label>
          <input id="benefitsTotal" name="benefitsTotal" type="number" step="0.01" className={`${INPUT} w-28`} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="deductions" className="block text-[12px] font-medium text-fg">Descontos</label>
          <input id="deductions" name="deductions" type="number" step="0.01" className={`${INPUT} w-28`} />
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
          {isPending ? "Lançando…" : "Lançar Evento"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}

const INPUT =
  "h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors";
