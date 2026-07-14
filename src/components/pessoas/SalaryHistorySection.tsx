"use client";

import { useActionState } from "react";
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
    <div className="bg-surface border border-border rounded-lg p-5 mb-4">
      <h2 className="text-[14px] font-semibold text-fg mb-3">Histórico Salarial</h2>

      {history.length === 0 ? (
        <p className="text-[13px] text-fg-muted mb-4">Nenhum reajuste registrado ainda.</p>
      ) : (
        <div className="divide-y divide-border mb-4">
          {history.map((h) => (
            <div key={h.id} className="py-2.5">
              <div className="flex items-center justify-between">
                <p className="text-[13px] text-fg">
                  {h.previousSalary ? `R$ ${h.previousSalary} → ` : ""}R$ {h.newSalary}
                  {h.changePercent && (
                    <span className={`ml-2 text-[12px] ${Number(h.changePercent) >= 0 ? "text-success" : "text-danger"}`}>
                      ({Number(h.changePercent) >= 0 ? "+" : ""}{h.changePercent}%)
                    </span>
                  )}
                </p>
                <span className="text-[12px] text-fg-muted">{h.effectiveDateLabel}</span>
              </div>
              {(h.cargoName || h.reason) && (
                <p className="text-[12px] text-fg-muted mt-0.5">
                  {[h.cargoName ? `Novo cargo: ${h.cargoName}` : null, h.reason].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          ))}
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
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Registrando…" : "Registrar Reajuste"}
        </button>
      </form>
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {state.error}
        </p>
      )}
    </div>
  );
}
