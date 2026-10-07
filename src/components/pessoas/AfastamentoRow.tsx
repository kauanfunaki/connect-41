"use client";

import { useActionState, useState } from "react";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import type { AbsenceType, AbsenceStatus } from "@/generated/prisma/enums";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { TIPO_DO_AFASTAMENTO, SITUACAO_DO_AFASTAMENTO, COR_DO_AFASTAMENTO, SeloDoDP } from "./rotulosDoDP";

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
        <div className="min-w-0">
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
          <SeloDoDP cor={COR_DO_AFASTAMENTO[afastamento.status]}>{SITUACAO_DO_AFASTAMENTO[afastamento.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este registro?" onRemover={removeAction} />}
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
              onChange={(e) => setStatus(e.target.value as AbsenceStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DO_AFASTAMENTO[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            {/* Sem rótulo visível, o campo dizia só "Escolher data" (DRG-16). */}
            <CampoData name="returnDate" title="Data de retorno" aria-label="Data de retorno" placeholder="Retorno" />
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
