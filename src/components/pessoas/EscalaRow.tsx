"use client";

import { useActionState, useState } from "react";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";
import type { ScheduleStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SITUACAO_DA_ESCALA, COR_DA_ESCALA } from "./rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DA_ESCALA) as ScheduleStatus[];

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-fg">
          {escala.dateLabel}
          {escala.shiftName && ` — ${escala.shiftName}`}
          {escala.dayOff && " · Folga"}
          {escala.isHoliday && " · Feriado"}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COR_DA_ESCALA[escala.status]}`}>
            {SITUACAO_DA_ESCALA[escala.status]}
          </span>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este dia da escala?" onRemover={removeAction} />}
        </div>
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
                <option key={s} value={s}>{SITUACAO_DA_ESCALA[s]}</option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            size="md"
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Salvando…" : "Atualizar"}
          </Button>
        </form>
      )}

      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
