"use client";

import { useActionState, useState } from "react";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import { AbsenceType, AbsenceStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TYPE_LABEL: Record<AbsenceType, string> = {
  FALTA:             "Falta",
  ATESTADO_PARCIAL:  "Atestado parcial",
  ATESTADO_INTEGRAL: "Atestado integral",
  LICENCA:           "Licença",
  AFASTAMENTO:       "Afastamento",
  RETORNO:           "Retorno",
};

const STATUS_LABEL: Record<AbsenceStatus, string> = {
  LANCADO:          "Lançado",
  EM_ANALISE:       "Em análise",
  APROVADO:         "Aprovado",
  REPROVADO:        "Reprovado",
  AFASTADO:         "Afastado",
  RETORNO_PREVISTO: "Retorno previsto",
  CONCLUIDO:        "Concluído",
};

const STATUS_STYLE: Record<AbsenceStatus, string> = {
  LANCADO:          "bg-surface-2 text-fg-muted border-border",
  EM_ANALISE:       "bg-warning/10 text-warning border-warning/25",
  APROVADO:         "bg-brand/10 text-brand border-brand/25",
  REPROVADO:        "bg-danger/10 text-danger border-danger/25",
  AFASTADO:         "bg-warning/10 text-warning border-warning/25",
  RETORNO_PREVISTO: "bg-brand/10 text-brand border-brand/25",
  CONCLUIDO:        "bg-success/10 text-success border-success/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as AbsenceStatus[];

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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg">
            {TYPE_LABEL[afastamento.type]} — {afastamento.startDateLabel}
            {afastamento.returnDateLabel && ` até ${afastamento.returnDateLabel}`}
            {afastamento.lostDays != null && ` · ${afastamento.lostDays} dia(s) perdido(s)`}
          </p>
          {canViewMedical && afastamento.reason && (
            <p className="text-[12px] text-fg-muted mt-0.5">{afastamento.reason}</p>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[afastamento.status]}`}>
          {STATUS_LABEL[afastamento.status]}
        </span>
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
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="returnDate" type="date" title="Data de retorno" />
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
              if (confirm("Remover este registro?")) removeAction();
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
