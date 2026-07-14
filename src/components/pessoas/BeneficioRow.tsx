"use client";

import { useActionState, useState } from "react";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";
import { BenefitStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const STATUS_LABEL: Record<BenefitStatus, string> = {
  ATIVO:     "Ativo",
  INATIVO:   "Inativo",
  SUSPENSO:  "Suspenso",
  PENDENTE:  "Pendente",
  CANCELADO: "Cancelado",
};

const STATUS_STYLE: Record<BenefitStatus, string> = {
  ATIVO:     "bg-success/10 text-success border-success/25",
  INATIVO:   "bg-surface-2 text-fg-muted border-border",
  SUSPENSO:  "bg-warning/10 text-warning border-warning/25",
  PENDENTE:  "bg-warning/10 text-warning border-warning/25",
  CANCELADO: "bg-danger/10 text-danger border-danger/25",
};

const STATUS_OPTIONS = Object.keys(STATUS_LABEL) as BenefitStatus[];

export type BeneficioItem = {
  id: string;
  benefitName: string;
  status: BenefitStatus;
  companyValue: string | null;
  discountValue: string | null;
  startDateLabel: string;
  endDateLabel: string | null;
};

type Props = {
  beneficio: BeneficioItem;
  updateAction: (prev: BenefitAssignmentState, form: FormData) => Promise<BenefitAssignmentState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function BeneficioRow({ beneficio, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(beneficio.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-fg">{beneficio.benefitName}</p>
          <p className="text-[12px] text-fg-muted">
            Desde {beneficio.startDateLabel}
            {beneficio.endDateLabel && ` até ${beneficio.endDateLabel}`}
            {beneficio.companyValue && ` · empresa R$ ${beneficio.companyValue}`}
            {beneficio.discountValue && ` · desconto R$ ${beneficio.discountValue}`}
          </p>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLE[beneficio.status]}`}>
          {STATUS_LABEL[beneficio.status]}
        </span>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-40">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as BenefitStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="endDate" type="date" title="Fim da vigência" />
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
              if (confirm("Remover este benefício do colaborador?")) removeAction();
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
