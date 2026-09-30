"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

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
          <Input id="acquisitivePeriodStart" name="acquisitivePeriodStart" type="date" required />
        </CampoForm>
        <CampoForm label="Fim do aquisitivo" htmlFor="acquisitivePeriodEnd" required>
          <Input id="acquisitivePeriodEnd" name="acquisitivePeriodEnd" type="date" required />
        </CampoForm>
        <CampoForm label="Início do concessivo" htmlFor="concessivePeriodStart">
          <Input id="concessivePeriodStart" name="concessivePeriodStart" type="date" />
        </CampoForm>
        <CampoForm label="Fim do concessivo" htmlFor="concessivePeriodEnd">
          <Input id="concessivePeriodEnd" name="concessivePeriodEnd" type="date" />
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
            {isPending ? "Programando…" : "Programar Férias"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </form>
  );
}
