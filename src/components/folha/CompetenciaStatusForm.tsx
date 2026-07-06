"use client";

import { useActionState, useState } from "react";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";
import { PayrollStatus } from "@/generated/prisma/enums";

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
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as PayrollStatus)}
          className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Atualizar Status"}
        </button>
      </form>
      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
