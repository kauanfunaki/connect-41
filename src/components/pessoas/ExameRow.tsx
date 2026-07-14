"use client";

import { useActionState, useState } from "react";
import type { ExameState } from "@/app/(app)/pessoas/[id]/exames/actions";
import { ExameAdmissionalStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<ExameAdmissionalStatus, string> = {
  SOLICITADO:             "Solicitado",
  AGENDADO:               "Agendado",
  REALIZADO:              "Realizado",
  ASO_PENDENTE:           "ASO pendente",
  ASO_APTO:               "ASO — Apto",
  ASO_INAPTO:             "ASO — Inapto",
  ASO_APTO_COM_RESTRICAO: "ASO — Apto com restrição",
};

const STATUS_STYLE: Record<ExameAdmissionalStatus, string> = {
  SOLICITADO:             "bg-surface-2 text-fg-muted border-border",
  AGENDADO:               "bg-brand/10 text-brand border-brand/25",
  REALIZADO:              "bg-brand/10 text-brand border-brand/25",
  ASO_PENDENTE:           "bg-warning/10 text-warning border-warning/25",
  ASO_APTO:               "bg-success/10 text-success border-success/25",
  ASO_INAPTO:             "bg-danger/10 text-danger border-danger/25",
  ASO_APTO_COM_RESTRICAO: "bg-warning/10 text-warning border-warning/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as ExameAdmissionalStatus[];

export type ExameItem = {
  id: string;
  status: ExameAdmissionalStatus;
  clinicName: string | null;
  scheduledAtLabel: string | null;
  performedAtLabel: string | null;
  asoDueDateLabel: string | null;
  notes: string | null;
};

type Props = {
  exame: ExameItem;
  updateAction: (prev: ExameState, form: FormData) => Promise<ExameState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function ExameRow({ exame, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(exame.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg font-medium">{exame.clinicName ?? "Clínica não informada"}</p>
          <p className="text-[12px] text-fg-muted">
            {exame.scheduledAtLabel && `Agendado: ${exame.scheduledAtLabel}`}
            {exame.performedAtLabel && ` · Realizado: ${exame.performedAtLabel}`}
            {exame.asoDueDateLabel && ` · Prazo ASO: ${exame.asoDueDateLabel}`}
          </p>
          {exame.notes && <p className="text-[12px] text-fg-muted mt-0.5">{exame.notes}</p>}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[exame.status]}`}>
          {STATUS_LABEL[exame.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-52">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ExameAdmissionalStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="performedAt" type="date" title="Data de realização" />
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
              if (confirm("Remover este exame?")) removeAction();
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
