"use client";

import { useActionState, useState } from "react";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";
import { ScheduleStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  PLANEJADA:  "Planejada",
  CONFIRMADA: "Confirmada",
  ALTERADA:   "Alterada",
  CANCELADA:  "Cancelada",
  REALIZADA:  "Realizada",
};

const STATUS_STYLE: Record<ScheduleStatus, string> = {
  PLANEJADA:  "bg-surface-2 text-fg-muted border-border",
  CONFIRMADA: "bg-brand/10 text-brand border-brand/25",
  ALTERADA:   "bg-warning/10 text-warning border-warning/25",
  CANCELADA:  "bg-danger/10 text-danger border-danger/25",
  REALIZADA:  "bg-success/10 text-success border-success/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as ScheduleStatus[];

export type EscalaItem = {
  id: string;
  dateLabel: string;
  shiftName: string | null;
  dayOff: boolean;
  isHoliday: boolean;
  status: ScheduleStatus;
};

type Props = {
  escala: EscalaItem;
  updateAction: (prev: ScheduleState, form: FormData) => Promise<ScheduleState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function EscalaRow({ escala, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(escala.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-fg">
          {escala.dateLabel}
          {escala.shiftName && ` — ${escala.shiftName}`}
          {escala.dayOff && " · Folga"}
          {escala.isHoliday && " · Feriado"}
        </p>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[escala.status]}`}>
          {STATUS_LABEL[escala.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-3 rounded-md border border-border text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Remover este dia da escala?")) removeAction();
            }}
            className="h-9 px-3 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
          >
            Remover
          </button>
        </form>
      )}

      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
