"use client";

import { useActionState, useState } from "react";
import type { OvertimeState } from "@/app/(app)/pessoas/[id]/horas-extras/actions";
import { DayType, OvertimeStatus } from "@/generated/prisma/enums";

const DAY_TYPE_LABEL: Record<DayType, string> = {
  UTIL: "Dia útil", FOLGA: "Folga", DOMINGO: "Domingo", FERIADO: "Feriado", NOTURNO: "Noturno",
};

const STATUS_LABEL: Record<OvertimeStatus, string> = {
  LANCADO:             "Lançado",
  PENDENTE_APROVACAO:  "Pendente de aprovação",
  APROVADO:            "Aprovado",
  REPROVADO:           "Reprovado",
  ENVIADO_FOLHA:       "Enviado para folha",
};

const STATUS_STYLE: Record<OvertimeStatus, string> = {
  LANCADO:            "bg-surface-2 text-fg-muted border-border",
  PENDENTE_APROVACAO: "bg-warning/10 text-warning border-warning/25",
  APROVADO:           "bg-success/10 text-success border-success/25",
  REPROVADO:          "bg-danger/10 text-danger border-danger/25",
  ENVIADO_FOLHA:      "bg-brand/10 text-brand border-brand/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as OvertimeStatus[];

export type HoraExtraItem = {
  id: string;
  dateLabel: string;
  dayType: DayType;
  overtimeHours: string | null;
  status: OvertimeStatus;
  justification: string | null;
};

type Props = {
  entry: HoraExtraItem;
  updateAction: (prev: OvertimeState, form: FormData) => Promise<OvertimeState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function HoraExtraRow({ entry, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(entry.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg">
            {entry.dateLabel} — {DAY_TYPE_LABEL[entry.dayType]}
            {entry.overtimeHours && ` · ${entry.overtimeHours}h extras`}
          </p>
          {entry.justification && <p className="text-[12px] text-fg-muted mt-0.5">{entry.justification}</p>}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[entry.status]}`}>
          {STATUS_LABEL[entry.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as OvertimeStatus)}
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
            {isPending ? "Salvando…" : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Remover este lançamento?")) removeAction();
            }}
            className="h-8 px-3 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
          >
            Remover
          </button>
        </form>
      )}

      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
