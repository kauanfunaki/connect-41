"use client";

import { useActionState } from "react";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: PayrollEntryState, form: FormData) => Promise<PayrollEntryState>;
  colaboradores: PersonOption[];
};

export function LancarEventoForm({ action, colaboradores }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <CampoForm label="Colaborador" htmlFor="personId" required>
          <Select id="personId" name="personId" required>
            <option value="">Selecione</option>
            {colaboradores.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Salário Bruto" htmlFor="grossSalary" required>
          <Input id="grossSalary" name="grossSalary" type="number" step="0.01" required prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Dias Trabalhados" htmlFor="workedDays">
          <Input id="workedDays" name="workedDays" type="number" min={0} max={31} />
        </CampoForm>
        <CampoForm label="Faltas" htmlFor="missedDays">
          <Input id="missedDays" name="missedDays" type="number" min={0} />
        </CampoForm>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <CampoForm label="Dias de Férias" htmlFor="vacationDays">
          <Input id="vacationDays" name="vacationDays" type="number" min={0} />
        </CampoForm>
        <CampoForm label="Dias de Afastamento" htmlFor="absenceDays">
          <Input id="absenceDays" name="absenceDays" type="number" min={0} />
        </CampoForm>
        <CampoForm label="Horas Extras" htmlFor="overtimeHours">
          <Input id="overtimeHours" name="overtimeHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="13º Salário" htmlFor="thirteenthSalary">
          <Input id="thirteenthSalary" name="thirteenthSalary" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Salário Família" htmlFor="familyAllowance">
          <Input id="familyAllowance" name="familyAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <CampoForm label="Adicional Noturno" htmlFor="nightShiftAllowance">
          <Input id="nightShiftAllowance" name="nightShiftAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Periculosidade" htmlFor="hazardPay">
          <Input id="hazardPay" name="hazardPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Insalubridade" htmlFor="unhealthyPay">
          <Input id="unhealthyPay" name="unhealthyPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Benefícios" htmlFor="benefitsTotal">
          <Input id="benefitsTotal" name="benefitsTotal" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Descontos" htmlFor="deductions">
          <Input id="deductions" name="deductions" type="number" step="0.01" prefix="R$" placeholder="0,00" />
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
          {isPending ? "Lançando…" : "Lançar Evento"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
