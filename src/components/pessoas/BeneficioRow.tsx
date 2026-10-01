"use client";

import { useActionState, useState } from "react";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";
import { BenefitStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SeloDoDP } from "./rotulosDoDP";

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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-fg">{beneficio.benefitName}</p>
          <p className="text-[12px] text-fg-muted">
            Desde {beneficio.startDateLabel}
            {beneficio.endDateLabel && ` até ${beneficio.endDateLabel}`}
            {beneficio.companyValue && ` · empresa R$ ${beneficio.companyValue}`}
            {beneficio.discountValue && ` · desconto R$ ${beneficio.discountValue}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={STATUS_STYLE[beneficio.status]}>{STATUS_LABEL[beneficio.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este benefício do colaborador?" onRemover={removeAction} />}
        </div>
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
              onChange={(e) => setStatus(e.target.value as BenefitStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Input name="endDate" type="date" title="Fim da vigência" aria-label="Fim da vigência" />
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
