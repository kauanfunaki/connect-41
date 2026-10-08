"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PayrollEntryState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { PayrollStatus } from "@/generated/prisma/enums";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "@/components/pessoas/MenuDoRegistro";
import { SeloDoDP } from "@/components/pessoas/rotulosDoDP";
// Reais em pt-BR (era "R$ 3500.5"). Troca por `formatarReais` de lib/format.ts
// quando a base o criar (auditoria DRG-01, 07/10/2026).
import { formatarReais } from "@/lib/format";

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
  EM_CONFERENCIA: "bg-warning/10 text-warning-fg border-warning/25",
  CONFERIDO:      "bg-brand/10 text-brand border-brand/25",
  ENVIADO:        "bg-brand/10 text-brand border-brand/25",
  PROCESSADO:     "bg-success/10 text-success-fg border-success/25",
  // Cancelado saiu de cena: neutro (07/10/2026).
  CANCELADO:      "bg-surface-2 text-fg-muted border-border",
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
    <div className="py-3 border-b border-border last:border-0">
      {/* Mesmo desenho das linhas de registro do DP (escala, férias, turma):
          nome, valor e selo em cima, com o "⋯"; situação e "Atualizar" embaixo.
          O "Remover" era um botão vermelho do tamanho do "Atualizar", ao lado
          dele (até 30/09) — foi para o menu, como nas outras linhas. */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/pessoas/${entry.personId}`}
          className="min-w-0 truncate text-[length:var(--fs-ui)] font-medium text-fg hover:text-brand transition-colors"
        >
          {entry.personName}
        </Link>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[length:var(--fs-2)] text-fg-muted tnum">{formatarReais(Number(entry.grossSalary))}</span>
          <SeloDoDP cor={STATUS_STYLE[entry.status]}>{STATUS_LABEL[entry.status]}</SeloDoDP>
          {canManage && <MenuDoRegistro titulo="Remover este lançamento?" onRemover={removeAction} />}
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-center gap-2 flex-wrap mt-2">
          <div className="w-44">
            <Select
              name="status"
              aria-label="Situação do lançamento"
              value={status}
              onChange={(e) => setStatus(e.target.value as PayrollStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
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

      {state?.error && <p className="text-[length:var(--fs-2)] text-danger mt-1">{state.error}</p>}
    </div>
  );
}
