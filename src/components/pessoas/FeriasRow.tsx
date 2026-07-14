"use client";

import { useActionState, useState } from "react";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import { VacationStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<VacationStatus, string> = {
  PLANEJADA:  "Planejada",
  SOLICITADA: "Solicitada",
  EM_ANALISE: "Em análise",
  APROVADA:   "Aprovada",
  PROGRAMADA: "Programada",
  EM_GOZO:    "Em gozo",
  CONCLUIDA:  "Concluída",
  CANCELADA:  "Cancelada",
};

const STATUS_STYLE: Record<VacationStatus, string> = {
  PLANEJADA:  "bg-surface-2 text-fg-muted border-border",
  SOLICITADA: "bg-brand/10 text-brand border-brand/25",
  EM_ANALISE: "bg-warning/10 text-warning border-warning/25",
  APROVADA:   "bg-brand/10 text-brand border-brand/25",
  PROGRAMADA: "bg-brand/10 text-brand border-brand/25",
  EM_GOZO:    "bg-success/10 text-success border-success/25",
  CONCLUIDA:  "bg-success/10 text-success border-success/25",
  CANCELADA:  "bg-danger/10 text-danger border-danger/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as VacationStatus[];

export type FeriasItem = {
  id: string;
  status: VacationStatus;
  acquisitivePeriodLabel: string;
  concessivePeriodLabel: string | null;
  days: number;
  isVencida: boolean;
};

type Props = {
  ferias: FeriasItem;
  updateAction: (prev: VacationState, form: FormData) => Promise<VacationState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function FeriasRow({ ferias, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(ferias.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg">
            Aquisitivo: {ferias.acquisitivePeriodLabel} · {ferias.days} dias
          </p>
          {ferias.concessivePeriodLabel && (
            <p className="text-[12px] text-fg-muted">Concessivo: {ferias.concessivePeriodLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {ferias.isVencida && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-danger/10 text-danger border-danger/25">
              Vencida
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[ferias.status]}`}>
            {STATUS_LABEL[ferias.status]}
          </span>
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as VacationStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="startDate" type="date" title="Data de início" />
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
              if (confirm("Remover este registro de férias?")) removeAction();
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
