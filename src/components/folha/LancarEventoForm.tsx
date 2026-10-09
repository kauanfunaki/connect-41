"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

type PersonOption = { id: string; name: string };

type Props = {
  action: (prev: PayrollEntryState, form: FormData) => Promise<PayrollEntryState>;
  colaboradores: PersonOption[];
};

/** A grade de cada bloco: quatro colunas no desktop, duas no tablet, uma no celular. */
const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

/**
 * Um bloco de números com o título no rótulo em caixa alta do sistema (o da
 * `FormSection`). É `<fieldset>`: o leitor de tela diz "Proventos" ao entrar no
 * primeiro campo do grupo.
 */
function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="c41-rotulo mb-2">{titulo}</legend>
      <div className={GRADE}>{children}</div>
    </fieldset>
  );
}

export function LancarEventoForm({ action, colaboradores }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 mb-6 space-y-5">
      <h3 className="text-ui font-medium text-fg">Lançar evento</h3>

      {/* Três blocos com título — Dias, Proventos e Descontos (escolha A da
          página "Telas pesadas", 08/10/2026). Eram os treze números numa grade
          só, sem separação: o DP procurava o campo pela posição. Agora cada
          número fica no grupo em que o DP pensa nele, e a grade de cada bloco
          é curta. O colaborador abre o formulário e as observações fecham;
          os `name` dos campos são os mesmos. */}
      <div className={GRADE}>
        <CampoForm label="Colaborador" htmlFor="personId" required className="sm:col-span-2">
          <SearchableSelect
            id="personId"
            name="personId"
            options={colaboradores.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Buscar colaborador…"
          />
        </CampoForm>
      </div>

      <Bloco titulo="Dias">
        <CampoForm label="Dias trabalhados" htmlFor="workedDays">
          <CampoNumero id="workedDays" name="workedDays" min={0} max={31} />
        </CampoForm>
        <CampoForm label="Faltas" htmlFor="missedDays">
          <CampoNumero id="missedDays" name="missedDays" min={0} />
        </CampoForm>
        <CampoForm label="Dias de férias" htmlFor="vacationDays">
          <CampoNumero id="vacationDays" name="vacationDays" min={0} />
        </CampoForm>
        <CampoForm label="Dias de afastamento" htmlFor="absenceDays">
          <CampoNumero id="absenceDays" name="absenceDays" min={0} />
        </CampoForm>
      </Bloco>

      <Bloco titulo="Proventos">
        <CampoForm label="Salário bruto" htmlFor="grossSalary" required>
          <Input id="grossSalary" name="grossSalary" type="number" step="0.01" required prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Horas extras" htmlFor="overtimeHours">
          <Input id="overtimeHours" name="overtimeHours" type="number" step="0.25" suffix="h" />
        </CampoForm>
        <CampoForm label="Adicional noturno" htmlFor="nightShiftAllowance">
          <Input id="nightShiftAllowance" name="nightShiftAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Periculosidade" htmlFor="hazardPay">
          <Input id="hazardPay" name="hazardPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>

        <CampoForm label="Insalubridade" htmlFor="unhealthyPay">
          <Input id="unhealthyPay" name="unhealthyPay" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="13º salário" htmlFor="thirteenthSalary">
          <Input id="thirteenthSalary" name="thirteenthSalary" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Salário-família" htmlFor="familyAllowance">
          <Input id="familyAllowance" name="familyAllowance" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Benefícios" htmlFor="benefitsTotal">
          <Input id="benefitsTotal" name="benefitsTotal" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
      </Bloco>

      {/* "Total de descontos", e não "Descontos" de novo embaixo do título do
          bloco: o campo é um valor só, a soma do que sai da folha. */}
      <Bloco titulo="Descontos">
        <CampoForm label="Total de descontos" htmlFor="deductions">
          <Input id="deductions" name="deductions" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
      </Bloco>

      <CampoForm label="Observações" htmlFor="notes">
        <Input id="notes" name="notes" type="text" />
      </CampoForm>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {state?.error && <p className="mr-auto text-helper font-medium text-danger">{state.error}</p>}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Lançando…" : "Lançar evento"}
        </Button>
      </div>
    </form>
  );
}
