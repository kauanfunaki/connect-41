"use client";

import { useActionState, useState } from "react";
import type { OvertimeState } from "@/app/(app)/pessoas/[id]/horas-extras/actions";
import type { DayType, OvertimeStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { TIPO_DO_DIA, SITUACAO_DA_HORA_EXTRA, COR_DA_HORA_EXTRA, SeloDoDP, horasDoDP } from "./rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DA_HORA_EXTRA) as OvertimeStatus[];

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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-fg">
            {entry.dateLabel} — {TIPO_DO_DIA[entry.dayType]}
            {entry.overtimeHours && ` · ${horasDoDP(entry.overtimeHours)} extras`}
          </p>
          {entry.justification && <p className="text-[12px] text-fg-muted mt-0.5">{entry.justification}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={COR_DA_HORA_EXTRA[entry.status]}>{SITUACAO_DA_HORA_EXTRA[entry.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este lançamento?" onRemover={removeAction} />}
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
              onChange={(e) => setStatus(e.target.value as OvertimeStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DA_HORA_EXTRA[s]}</option>
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

      {state?.error && <p className="mt-2 text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </div>
  );
}
