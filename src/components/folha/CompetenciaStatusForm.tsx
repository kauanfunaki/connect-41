"use client";

import { useActionState, useState } from "react";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";
import { PayrollStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<PayrollStatus, string> = {
  PENDENTE:       "Pendente",
  EM_CONFERENCIA: "Em conferência",
  CONFERIDO:      "Conferido",
  ENVIADO:        "Enviado",
  PROCESSADO:     "Processado",
  CANCELADO:      "Cancelado",
};
const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as PayrollStatus[];

type Props = {
  action: (prev: PayrollCompetencyState, form: FormData) => Promise<PayrollCompetencyState>;
  currentStatus: PayrollStatus;
};

export function CompetenciaStatusForm({ action, currentStatus }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [status, setStatus] = useState(currentStatus);

  return (
    <div>
      <form action={formAction} className="flex items-center gap-2">
        <div className="w-44">
          <Select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PayrollStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          size="md"
          type="submit"
          disabled={isPending}
        >
          {isPending ? "Salvando…" : "Atualizar Status"}
        </Button>
      </form>
      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
