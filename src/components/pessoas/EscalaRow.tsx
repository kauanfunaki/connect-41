"use client";

import { useActionState, useState } from "react";
import type { ScheduleState } from "@/app/(app)/pessoas/[id]/escala/actions";
import type { ScheduleStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SITUACAO_DA_ESCALA, COR_DA_ESCALA, SeloDoDP } from "./rotulosDoDP";

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
        <p className="text-ui text-fg">
          {escala.dateLabel}
          {escala.shiftName && ` — ${escala.shiftName}`}
          {escala.dayOff && " · Folga"}
          {escala.isHoliday && " · Feriado"}
        </p>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={COR_DA_ESCALA[escala.status]}>{SITUACAO_DA_ESCALA[escala.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este dia da escala?" onRemover={removeAction} />}
        </div>
      </div>

      {/* Revisão de alinhamento (30/09): a situação tem a mesma largura em
          todas as telas da ficha (era w-40, w-44, w-52 ou w-56 conforme a
          tela), a data a de uma data, e tudo na altura do botão. */}
      {canManage && (
        <form action={formAction} className="flex flex-wrap items-center gap-2 mt-3">
          <div className="w-full sm:w-56">
            <Select
              aria-label="Situação"
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

      {state?.error && <p className="mt-2 text-helper font-medium text-danger">{state.error}</p>}
    </div>
  );
}
