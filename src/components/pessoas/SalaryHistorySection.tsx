"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { SalaryChangeState } from "@/app/(app)/pessoas/[id]/salario/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type SalaryChangeItem = {
  id: string;
  previousSalary: string | null;
  newSalary: string;
  changePercent: string | null;
  cargoName: string | null;
  reason: string | null;
  effectiveDateLabel: string;
};

type CargoOption = { id: string; name: string };

type Props = {
  action: (prev: SalaryChangeState, form: FormData) => Promise<SalaryChangeState>;
  history: SalaryChangeItem[];
  cargos: CargoOption[];
};

export function SalaryHistorySection({ action, history, cargos }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mb-4">
      <h2 className="text-[14px] font-semibold text-fg mb-3">Histórico Salarial</h2>

      {history.length === 0 ? (
        <p className="text-[13px] text-fg-muted mb-4">Nenhum reajuste registrado ainda.</p>
      ) : (
        // Era uma lista de linhas (até 30/09); virou tabela no casco padrão.
        // Sem funil: data e valores são únicos por linha — filtro não ajuda.
        <div className="c41-tabela overflow-x-auto rounded-lg border border-border mb-4">
          <table className="w-full min-w-[640px] text-[length:var(--fs-ui)]">
            <thead>
              <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                <th className="px-4 py-3">Vigência</th>
                <th className="px-4 py-3">Salário</th>
                <th className="px-4 py-3">Variação</th>
                <th className="px-4 py-3">Novo cargo</th>
                <th className="px-4 py-3">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-border">
                  <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{h.effectiveDateLabel}</td>
                  <td className="px-4 py-3 text-fg whitespace-nowrap">
                    {h.previousSalary ? <span className="text-fg-muted">R$ {h.previousSalary} → </span> : ""}R$ {h.newSalary}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {h.changePercent ? (
                      <span className={Number(h.changePercent) >= 0 ? "text-success" : "text-danger"}>
                        {Number(h.changePercent) >= 0 ? "+" : ""}
                        {h.changePercent}%
                      </span>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-secondary">{h.cargoName ?? <span className="text-fg-muted">—</span>}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    <span className="block max-w-[260px] truncate" title={h.reason ?? undefined}>
                      {h.reason ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
        <div className="w-44">
          <CampoForm label="Novo Salário" htmlFor="newSalary" required>
            <Input id="newSalary" name="newSalary" type="number" step="0.01" required prefix="R$" placeholder="0,00" />
          </CampoForm>
        </div>
        <div className="w-40">
          <CampoForm label="Data do Reajuste" htmlFor="effectiveDate" required>
            <Input id="effectiveDate" name="effectiveDate" type="date" required />
          </CampoForm>
        </div>
        <div className="w-52">
          <CampoForm label="Novo Cargo (promoção)" htmlFor="cargoId">
            <Select id="cargoId" name="cargoId" defaultValue="">
              <option value="">Sem alteração</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <div className="flex-1 min-w-[160px]">
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
        </div>
        <Button
          type="submit"
          disabled={isPending}
          variant="primary" className="font-medium disabled:opacity-60"
        >
          {isPending ? "Registrando…" : "Registrar Reajuste"}
       </Button>
      </form>
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {state.error}
        </p>
      )}
    </div>
  );
}
