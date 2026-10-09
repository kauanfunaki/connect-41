"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";

type Props = {
  action: (prev: PayrollCompetencyState, form: FormData) => Promise<PayrollCompetencyState>;
  companyId: string;
};

export function AbrirCompetenciaForm({ action, companyId }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const now = new Date();

  return (
    <form action={formAction} className="mb-6 space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      {/* Mês e ano são números curtos: colunas estreitas fixas, também no
          celular; o botão desce para a linha de baixo só lá. Um pouco mais
          largas desde que ganharam o − e o + (08/10/2026). */}
      <div className="grid grid-cols-2 sm:grid-cols-[112px_128px_auto] sm:justify-start gap-4">
        <CampoForm label="Mês" htmlFor="month">
          <CampoNumero id="month" name="month" min={1} max={12} defaultValue={now.getMonth() + 1} />
        </CampoForm>
        <CampoForm label="Ano" htmlFor="year">
          <CampoNumero id="year" name="year" min={2000} defaultValue={now.getFullYear()} />
        </CampoForm>
        <AlinhadoAoCampo className="col-span-2 sm:col-span-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Abrindo…" : "Abrir competência"}
          </Button>
        </AlinhadoAoCampo>
      </div>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
