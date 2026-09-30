"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import type { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { TIPO_DO_DESLIGAMENTO, SITUACAO_DO_DESLIGAMENTO, COR_DO_DESLIGAMENTO } from "./rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DO_DESLIGAMENTO) as TerminationStatus[];

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

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-fg">
            {TIPO_DO_DESLIGAMENTO[desligamento.type]} — solicitado em {desligamento.requestedAtLabel}
            {desligamento.finalizedAtLabel && ` · finalizado em ${desligamento.finalizedAtLabel}`}
          </p>
          {desligamento.reason && <p className="text-[12px] text-fg-muted mt-0.5">{desligamento.reason}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COR_DO_DESLIGAMENTO[desligamento.status]}`}>
            {SITUACAO_DO_DESLIGAMENTO[desligamento.status]}
          </span>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este registro de desligamento?" onRemover={removeAction} />}
        </div>
      </div>

      {/* Entrada da conferência do TRCT — o status acima é o andamento do
          desligamento; isto é a checagem item a item do que a contabilidade
          mandou. Era um link com cara de botão; virou botão (30/09). */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <Button href={conferenciaHref} variant="secondary" size="sm">
          <ClipboardCheck size={14} />
          Conferência do TRCT
        </Button>
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
                <option key={s} value={s}>{SITUACAO_DO_DESLIGAMENTO[s]}</option>
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
