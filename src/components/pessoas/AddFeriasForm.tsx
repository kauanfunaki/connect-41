"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";

type Props = {
  action: (prev: VacationState, form: FormData) => Promise<VacationState>;
};

export function AddFeriasForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): os rótulos "Período Aquisitivo — Início"
  // quebravam em duas linhas numa coluna estreita e derrubavam o campo, e as
  // caixas de marcar eram acertadas com `pb-2` na mão. Agora os quatro
  // períodos e os dias numa grade só, as caixas numa linha própria e o botão
  // alinhado ao campo de observações.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_120px]">
        <CampoForm label="Início do aquisitivo" htmlFor="acquisitivePeriodStart" required>
          <CampoData id="acquisitivePeriodStart" name="acquisitivePeriodStart" required />
        </CampoForm>
        <CampoForm label="Fim do aquisitivo" htmlFor="acquisitivePeriodEnd" required>
          <CampoData id="acquisitivePeriodEnd" name="acquisitivePeriodEnd" required />
        </CampoForm>
        <CampoForm label="Início do concessivo" htmlFor="concessivePeriodStart">
          <CampoData id="concessivePeriodStart" name="concessivePeriodStart" />
        </CampoForm>
        <CampoForm label="Fim do concessivo" htmlFor="concessivePeriodEnd">
          <CampoData id="concessivePeriodEnd" name="concessivePeriodEnd" />
        </CampoForm>
        <CampoForm label="Dias" htmlFor="days">
          <Input id="days" name="days" type="number" min={1} max={30} defaultValue={30} />
        </CampoForm>
      </FieldGrid>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Checkbox id="cashAllowance" name="cashAllowance" value="true" label="Abono pecuniário" />
        <Checkbox id="installment" name="installment" value="true" label="Parcelamento" />
      </div>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Programando…" : "Programar férias"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
