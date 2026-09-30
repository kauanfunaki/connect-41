"use client";

import { useActionState, useState } from "react";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import type { AbsenceType, AbsenceStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { TIPO_DO_AFASTAMENTO, SITUACAO_DO_AFASTAMENTO, COR_DO_AFASTAMENTO } from "./rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DO_AFASTAMENTO) as AbsenceStatus[];

export type AfastamentoItem = {
  id: string;
  type: AbsenceType;
  status: AbsenceStatus;
  startDateLabel: string;
  returnDateLabel: string | null;
  lostDays: number | null;
  reason: string | null;
};

type Props = {
  afastamento: AfastamentoItem;
  updateAction: (prev: AbsenceState, form: FormData) => Promise<AbsenceState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
  canViewMedical: boolean;
};

export function AfastamentoRow({ afastamento, updateAction, removeAction, canManage, canViewMedical }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(afastamento.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-fg">
            {TIPO_DO_AFASTAMENTO[afastamento.type]} — {afastamento.startDateLabel}
            {afastamento.returnDateLabel && ` até ${afastamento.returnDateLabel}`}
            {afastamento.lostDays != null && ` · ${afastamento.lostDays} dia(s) perdido(s)`}
          </p>
          {canViewMedical && afastamento.reason && (
            <p className="text-[12px] text-fg-muted mt-0.5">{afastamento.reason}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COR_DO_AFASTAMENTO[afastamento.status]}`}>
            {SITUACAO_DO_AFASTAMENTO[afastamento.status]}
          </span>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este registro?" onRemover={removeAction} />}
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AbsenceStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DO_AFASTAMENTO[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="returnDate" type="date" title="Data de retorno" />
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
