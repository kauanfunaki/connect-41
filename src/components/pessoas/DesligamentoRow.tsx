"use client";

import { useActionState, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import type { TerminationType, TerminationStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { TIPO_DO_DESLIGAMENTO, SITUACAO_DO_DESLIGAMENTO, COR_DO_DESLIGAMENTO, SeloDoDP } from "./rotulosDoDP";

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
        <div className="min-w-0">
          <p className="text-[length:var(--fs-ui)] text-fg">
            {TIPO_DO_DESLIGAMENTO[desligamento.type]} — solicitado em {desligamento.requestedAtLabel}
            {desligamento.finalizedAtLabel && ` · finalizado em ${desligamento.finalizedAtLabel}`}
          </p>
          {desligamento.reason && <p className="text-[length:var(--fs-2)] text-fg-muted mt-0.5">{desligamento.reason}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={COR_DO_DESLIGAMENTO[desligamento.status]}>{SITUACAO_DO_DESLIGAMENTO[desligamento.status]}</SeloDoDP>
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
            <span className="text-[length:var(--fs-2)] text-fg-muted tnum">{desligamento.conferencia.progressoPct}% tratado</span>
            {desligamento.conferencia.divergentes > 0 && (
              <SeloDoDP cor="bg-danger/10 text-danger border-danger/25">{desligamento.conferencia.divergentes} divergência(s)</SeloDoDP>
            )}
            {desligamento.conferencia.pendentes > 0 && (
              <SeloDoDP cor="bg-surface-2 text-fg-muted border-border">{desligamento.conferencia.pendentes} pendente(s)</SeloDoDP>
            )}
          </>
        )}
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

      {state?.error && <p className="mt-2 text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
    </div>
  );
}
