"use client";

import { useActionState, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";
import { BenefitStatus } from "@/generated/prisma/enums";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SeloDoDP } from "./rotulosDoDP";
// Reais em pt-BR (era "R$ 350.5"). Troca por `formatarReais` de lib/format.ts
// quando a base o criar (auditoria DRG-01, 07/10/2026).
import { formatarReais } from "@/lib/format";

const STATUS_LABEL: Record<BenefitStatus, string> = {
  ATIVO:     "Ativo",
  INATIVO:   "Inativo",
  SUSPENSO:  "Suspenso",
  PENDENTE:  "Pendente",
  CANCELADO: "Cancelado",
};

const STATUS_STYLE: Record<BenefitStatus, string> = {
  ATIVO:     "bg-success/10 text-success-fg border-success/25",
  INATIVO:   "bg-surface-2 text-fg-muted border-border",
  SUSPENSO:  "bg-warning/10 text-warning-fg border-warning/25",
  PENDENTE:  "bg-warning/10 text-warning-fg border-warning/25",
  // Cancelado saiu de cena: neutro, como o inativo (07/10/2026).
  CANCELADO: "bg-surface-2 text-fg-muted border-border",
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
  /** Só para o administrador (13/10/2026): sem ela, o "⋯" de remover não aparece. */
  removeAction?: () => Promise<void>;
  canManage: boolean;
};

export function BeneficioRow({ beneficio, updateAction, removeAction, canManage }: Props) {
  // "Atualizar" diz que gravou (auditoria de UX, 30/10/2026): antes, sem erro, nada mudava na tela além do selo.
  const toast = useToast();
  const [state, formAction, isPending] = useActionState(async (anterior: Parameters<typeof updateAction>[0], form: FormData) => {
    const r = await updateAction(anterior, form);
    if (!r?.error) toast.success("Registro atualizado.");
    return r;
  }, null);
  const [status, setStatus] = useState(beneficio.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ui text-fg">{beneficio.benefitName}</p>
          <p className="text-fs-2 text-fg-muted">
            Desde {beneficio.startDateLabel}
            {beneficio.endDateLabel && ` até ${beneficio.endDateLabel}`}
            {beneficio.companyValue && ` · empresa ${formatarReais(Number(beneficio.companyValue))}`}
            {beneficio.discountValue && ` · desconto ${formatarReais(Number(beneficio.discountValue))}`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={STATUS_STYLE[beneficio.status]}>{STATUS_LABEL[beneficio.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && removeAction && <MenuDoRegistro titulo="Remover este benefício do colaborador?" onRemover={removeAction} />}
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
            {/* Sem rótulo visível, o campo dizia só "Escolher data" (DRG-16). */}
            <CampoData name="endDate" title="Fim da vigência" aria-label="Fim da vigência" placeholder="Fim da vigência" />
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

      {state?.error && <Aviso className="mt-2">{state.error}</Aviso>}
    </div>
  );
}
