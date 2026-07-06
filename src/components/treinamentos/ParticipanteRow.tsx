"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { TrainingParticipantState } from "@/app/(app)/treinamentos/[id]/turmas/[classId]/actions";
import { TrainingParticipantStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "Planejado",
  CONVOCADO: "Convocado",
  REALIZADO: "Realizado",
  AUSENTE:   "Ausente",
  REPROVADO: "Reprovado",
  CONCLUIDO: "Concluído",
  VENCIDO:   "Vencido",
};

const STATUS_STYLE: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "bg-surface-2 text-fg-muted border-border",
  CONVOCADO: "bg-brand/10 text-brand border-brand/25",
  REALIZADO: "bg-success/10 text-success border-success/25",
  AUSENTE:   "bg-warning/10 text-warning border-warning/25",
  REPROVADO: "bg-danger/10 text-danger border-danger/25",
  CONCLUIDO: "bg-success/10 text-success border-success/25",
  VENCIDO:   "bg-danger/10 text-danger border-danger/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as TrainingParticipantStatus[];

export type ParticipanteItem = {
  id: string;
  personId: string;
  personName: string;
  status: TrainingParticipantStatus;
};

type Props = {
  participante: ParticipanteItem;
  updateAction: (prev: TrainingParticipantState, form: FormData) => Promise<TrainingParticipantState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function ParticipanteRow({ participante, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(participante.status);

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <Link href={`/pessoas/${participante.personId}`} className="text-[13px] text-brand hover:underline">
          {participante.personName}
        </Link>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[participante.status]}`}>
          {STATUS_LABEL[participante.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-1.5">
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TrainingParticipantStatus)}
            className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isPending}
            className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-secondary hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Atualizar"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Remover este participante da turma?")) removeAction();
            }}
            className="h-8 px-3 rounded-md text-[12px] text-danger hover:bg-danger/8 transition-colors"
          >
            Remover
          </button>
        </form>
      )}

      {state?.error && <p className="text-[12px] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
