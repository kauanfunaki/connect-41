"use client";

import { useActionState, useState } from "react";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";

const TYPE_LABEL: Record<TerminationType, string> = {
  VOLUNTARIO:       "Voluntário",
  INVOLUNTARIO:     "Involuntário",
  TERMINO_CONTRATO: "Término de contrato",
  EXPERIENCIA:      "Experiência",
  JUSTA_CAUSA:      "Justa causa",
  SEM_JUSTA_CAUSA:  "Sem justa causa",
};

const STATUS_LABEL: Record<TerminationStatus, string> = {
  SOLICITADO:             "Solicitado",
  EM_CALCULO:             "Em cálculo",
  DOCUMENTACAO_PENDENTE:  "Documentação pendente",
  ASSINATURA_PENDENTE:    "Assinatura pendente",
  FINALIZADO:             "Finalizado",
  CANCELADO:              "Cancelado",
};

const STATUS_STYLE: Record<TerminationStatus, string> = {
  SOLICITADO:            "bg-surface-2 text-fg-muted border-border",
  EM_CALCULO:            "bg-warning/10 text-warning border-warning/25",
  DOCUMENTACAO_PENDENTE: "bg-warning/10 text-warning border-warning/25",
  ASSINATURA_PENDENTE:   "bg-warning/10 text-warning border-warning/25",
  FINALIZADO:            "bg-success/10 text-success border-success/25",
  CANCELADO:             "bg-danger/10 text-danger border-danger/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as TerminationStatus[];

export type DesligamentoItem = {
  id: string;
  type: TerminationType;
  status: TerminationStatus;
  reason: string | null;
  requestedAtLabel: string;
  finalizedAtLabel: string | null;
};

type Props = {
  desligamento: DesligamentoItem;
  updateAction: (prev: TerminationState, form: FormData) => Promise<TerminationState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function DesligamentoRow({ desligamento, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(desligamento.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg">
            {TYPE_LABEL[desligamento.type]} — solicitado em {desligamento.requestedAtLabel}
            {desligamento.finalizedAtLabel && ` · finalizado em ${desligamento.finalizedAtLabel}`}
          </p>
          {desligamento.reason && <p className="text-[12px] text-fg-muted mt-0.5">{desligamento.reason}</p>}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[desligamento.status]}`}>
          {STATUS_LABEL[desligamento.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-56">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TerminationStatus)}
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
              if (confirm("Remover este registro de desligamento?")) removeAction();
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
