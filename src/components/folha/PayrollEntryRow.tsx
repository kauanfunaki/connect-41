"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { PayrollStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<PayrollStatus, string> = {
  PENDENTE:       "Pendente",
  EM_CONFERENCIA: "Em conferência",
  CONFERIDO:      "Conferido",
  ENVIADO:        "Enviado",
  PROCESSADO:     "Processado",
  CANCELADO:      "Cancelado",
};

const STATUS_STYLE: Record<PayrollStatus, string> = {
  PENDENTE:       "bg-surface-2 text-fg-muted border-border",
  EM_CONFERENCIA: "bg-warning/10 text-warning border-warning/25",
  CONFERIDO:      "bg-brand/10 text-brand border-brand/25",
  ENVIADO:        "bg-brand/10 text-brand border-brand/25",
  PROCESSADO:     "bg-success/10 text-success border-success/25",
  CANCELADO:      "bg-danger/10 text-danger border-danger/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as PayrollStatus[];

export type PayrollEntryItem = {
  id: string;
  personId: string;
  personName: string;
  grossSalary: string;
  status: PayrollStatus;
};

type Props = {
  entry: PayrollEntryItem;
  updateAction: (prev: PayrollEntryState, form: FormData) => Promise<PayrollEntryState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function PayrollEntryRow({ entry, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(entry.status);

  return (
    <div className="py-2.5 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <Link href={`/pessoas/${entry.personId}`} className="text-[13px] text-brand hover:underline">
          {entry.personName}
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-fg-muted tnum">R$ {entry.grossSalary}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[entry.status]}`}>
            {STATUS_LABEL[entry.status]}
          </span>
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-1.5">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as PayrollStatus)}
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
              if (confirm("Remover este lançamento?")) removeAction();
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
