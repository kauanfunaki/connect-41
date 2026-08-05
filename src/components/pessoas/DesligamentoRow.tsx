"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { useConfirm } from "@/components/ui/useConfirm";

const TYPE_LABEL: Record<TerminationType, string> = {
  VOLUNTARIO:        "Voluntário",
  INVOLUNTARIO:      "Involuntário",
  TERMINO_CONTRATO:  "Término de contrato",
  EXPERIENCIA:       "Experiência",
  JUSTA_CAUSA:       "Justa causa",
  SEM_JUSTA_CAUSA:   "Sem justa causa",
  ACORDO_484A:       "Acordo entre as partes (art. 484-A)",
  RESCISAO_INDIRETA: "Rescisão indireta",
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
  /** Resumo da conferência do TRCT, quando já foi iniciada. */
  conferencia: { pendentes: number; divergentes: number; progressoPct: number } | null;
};

type Props = {
  desligamento: DesligamentoItem;
  conferenciaHref: string;
  updateAction: (prev: TerminationState, form: FormData) => Promise<TerminationState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function DesligamentoRow({ desligamento, conferenciaHref, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(desligamento.status);
  const { dialog, requestConfirm } = useConfirm();

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

      {/* Entrada da conferência do TRCT — o status acima é o andamento do
          desligamento; isto é a checagem item a item do que a contabilidade
          mandou. */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Link
          href={conferenciaHref}
          className="inline-flex items-center h-8 px-3 rounded-md border border-border text-[12px] font-medium text-brand hover:bg-brand/8 transition-colors"
        >
          Conferência do TRCT
        </Link>
        {desligamento.conferencia && (
          <>
            <span className="text-[12px] text-fg-muted tnum">{desligamento.conferencia.progressoPct}% tratado</span>
            {desligamento.conferencia.divergentes > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-danger/10 text-danger border border-danger/25">
                {desligamento.conferencia.divergentes} divergência(s)
              </span>
            )}
            {desligamento.conferencia.pendentes > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-fg-muted border border-border">
                {desligamento.conferencia.pendentes} pendente(s)
              </span>
            )}
          </>
        )}
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
            onClick={() => requestConfirm({ title: "Remover este registro de desligamento?", destructive: true, confirmLabel: "Remover" }, removeAction)}
            className="h-9 px-3 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
          >
            Remover
          </button>
        </form>
      )}

      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
      {dialog}
    </div>
  );
}
