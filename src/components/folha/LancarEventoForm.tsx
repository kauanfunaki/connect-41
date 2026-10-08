"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: PayrollEntryState, form: FormData) => Promise<PayrollEntryState>;
  colaboradores: PersonOption[];
};

export function LancarEventoForm({ action, colaboradores }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 mb-6 space-y-4">
      <h3 className="text-ui font-medium text-fg">Lançar evento</h3>

      {/* Eram três grades de 4, 5 e 5 colunas empilhadas — as colunas de uma
          linha não caíam sob as da outra, e o colaborador (o campo mais largo)
          ficava num quarto da linha. Agora é uma grade só de 4 colunas: o
          colaborador ocupa três, e os doze números fecham três linhas cheias
          (dias, depois horas e adicionais, depois o resto dos valores). */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CampoForm label="Colaborador" htmlFor="personId" required className="sm:col-span-2 lg:col-span-3">
          <SearchableSelect
            id="personId"
            name="personId"
            options={colaboradores.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Buscar colaborador…"
          />
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
        <CampoForm label="Dias de Férias" htmlFor="vacationDays">
          <Input id="vacationDays" name="vacationDays" type="number" min={0} />
        </CampoForm>
        <CampoForm label="Dias de Afastamento" htmlFor="absenceDays">
          <Input id="absenceDays" name="absenceDays" type="number" min={0} />
        </CampoForm>

        <CampoForm label="Horas Extras" htmlFor="overtimeHours">
          <Input id="overtimeHours" name="overtimeHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="Adicional Noturno" htmlFor="nightShiftAllowance">
          <Input id="nightShiftAllowance" name="nightShiftAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Periculosidade" htmlFor="hazardPay">
          <Input id="hazardPay" name="hazardPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Insalubridade" htmlFor="unhealthyPay">
          <Input id="unhealthyPay" name="unhealthyPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>

        <CampoForm label="13º Salário" htmlFor="thirteenthSalary">
          <Input id="thirteenthSalary" name="thirteenthSalary" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Salário Família" htmlFor="familyAllowance">
          <Input id="familyAllowance" name="familyAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Benefícios" htmlFor="benefitsTotal">
          <Input id="benefitsTotal" name="benefitsTotal" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Descontos" htmlFor="deductions">
          <Input id="deductions" name="deductions" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>

        <CampoForm label="Observações" htmlFor="notes" className="sm:col-span-2 lg:col-span-4">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state?.error && <p className="mr-auto text-helper font-medium text-danger">{state.error}</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Lançando…" : "Lançar Evento"}
        </Button>
      </div>
    </form>
  );
}
