"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { TrainingParticipantState } from "@/app/(app)/treinamentos/[id]/turmas/[classId]/actions";
import type { TrainingParticipantStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "@/components/pessoas/MenuDoRegistro";
import { SITUACAO_DO_PARTICIPANTE, COR_DO_PARTICIPANTE } from "@/components/pessoas/rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DO_PARTICIPANTE) as TrainingParticipantStatus[];

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
      <div className="flex items-center justify-between gap-3">
        <Link href={`/pessoas/${participante.personId}`} className="text-[13px] text-brand hover:underline">
          {participante.personName}
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COR_DO_PARTICIPANTE[participante.status]}`}>
            {SITUACAO_DO_PARTICIPANTE[participante.status]}
          </span>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este participante da turma?" onRemover={removeAction} />}
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-1.5">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TrainingParticipantStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DO_PARTICIPANTE[s]}</option>
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
