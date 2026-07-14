"use client";

import { useActionState } from "react";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: PayrollCompetencyState, form: FormData) => Promise<PayrollCompetencyState>;
  companyId: string;
};

export function AbrirCompetenciaForm({ action, companyId }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const now = new Date();

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <input type="hidden" name="companyId" value={companyId} />
      <div className="w-24">
        <CampoForm label="Mês" htmlFor="month">
          <Input id="month" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} />
        </CampoForm>
      </div>
      <div className="w-28">
        <CampoForm label="Ano" htmlFor="year">
          <Input id="year" name="year" type="number" min={2000} defaultValue={now.getFullYear()} />
        </CampoForm>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Abrindo…" : "Abrir Competência"}
      </button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
