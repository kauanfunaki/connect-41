"use client";

import { useActionState, useState } from "react";
import type { ExameState } from "@/app/(app)/pessoas/[id]/exames/actions";
import { ExameAdmissionalStatus } from "@/generated/prisma/enums";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SeloDoDP } from "./rotulosDoDP";

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
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-ui)] text-fg font-medium">{exame.clinicName ?? "Clínica não informada"}</p>
          <p className="text-[length:var(--fs-2)] text-fg-muted">
            {exame.scheduledAtLabel && `Agendado: ${exame.scheduledAtLabel}`}
            {exame.performedAtLabel && ` · Realizado: ${exame.performedAtLabel}`}
            {exame.asoDueDateLabel && ` · Prazo ASO: ${exame.asoDueDateLabel}`}
          </p>
          {exame.notes && <p className="text-[length:var(--fs-2)] text-fg-muted mt-0.5">{exame.notes}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <SeloDoDP cor={STATUS_STYLE[exame.status]}>{STATUS_LABEL[exame.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este exame?" onRemover={removeAction} />}
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
              onChange={(e) => setStatus(e.target.value as ExameAdmissionalStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            {/* Sem rótulo visível, o campo dizia só "Escolher data" (DRG-16). */}
            <CampoData name="performedAt" title="Data de realização" aria-label="Data de realização" placeholder="Realização" />
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
