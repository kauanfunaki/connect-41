"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CandidaturaState } from "@/app/(app)/vagas/[id]/actions";
import { ProcessoSeletivoStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<ProcessoSeletivoStatus, string> = {
  EM_ANDAMENTO: "Em andamento",
  APROVADO:     "Aprovado",
  REPROVADO:    "Reprovado",
  DESISTENTE:   "Desistente",
  CONTRATADO:   "Contratado",
  ENCERRADO:    "Encerrado",
};

const STATUS_STYLE: Record<ProcessoSeletivoStatus, string> = {
  EM_ANDAMENTO: "bg-brand/10 text-brand border-brand/25",
  APROVADO:     "bg-success/10 text-success border-success/25",
  REPROVADO:    "bg-danger/10 text-danger border-danger/25",
  DESISTENTE:   "bg-surface-2 text-fg-muted border-border",
  CONTRATADO:   "bg-success/10 text-success border-success/25",
  ENCERRADO:    "bg-surface-2 text-fg-muted border-border",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as ProcessoSeletivoStatus[];

export type CandidaturaItem = {
  id: string;
  status: ProcessoSeletivoStatus;
  origin: string | null;
  personId: string;
  personName: string;
};

type Props = {
  candidatura: CandidaturaItem;
  updateAction: (prev: CandidaturaState, form: FormData) => Promise<CandidaturaState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function CandidaturaRow({ candidatura, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(candidatura.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/pessoas/${candidatura.personId}`} className="text-[13px] text-brand hover:underline">
            {candidatura.personName}
          </Link>
          {candidatura.origin && (
            <span className="text-[12px] text-fg-muted ml-2">via {candidatura.origin}</span>
          )}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[candidatura.status]}`}>
          {STATUS_LABEL[candidatura.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProcessoSeletivoStatus)}
            className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
          {status === "REPROVADO" && (
            <input name="rejectionReason" placeholder="Motivo da reprovação" className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg flex-1 min-w-[160px]" />
          )}
          {status === "DESISTENTE" && (
            <input name="withdrawalReason" placeholder="Motivo da desistência" className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg flex-1 min-w-[160px]" />
          )}
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
              if (confirm(`Remover ${candidatura.personName} desta vaga?`)) removeAction();
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
