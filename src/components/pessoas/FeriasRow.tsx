"use client";

import { useActionState, useState } from "react";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import type { VacationStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SITUACAO_DAS_FERIAS, COR_DAS_FERIAS, SeloDoDP } from "./rotulosDoDP";

const STATUS_OPTIONS = Object.keys(SITUACAO_DAS_FERIAS) as VacationStatus[];

export type FeriasItem = {
  id: string;
  status: VacationStatus;
  acquisitivePeriodLabel: string;
  concessivePeriodLabel: string | null;
  days: number;
  isVencida: boolean;
};

type Props = {
  ferias: FeriasItem;
  updateAction: (prev: VacationState, form: FormData) => Promise<VacationState>;
  removeAction: () => Promise<void>;
  canManage: boolean;
};

export function FeriasRow({ ferias, updateAction, removeAction, canManage }: Props) {
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const [status, setStatus] = useState(ferias.status);

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-fg">
            Aquisitivo: {ferias.acquisitivePeriodLabel} · {ferias.days} dias
          </p>
          {ferias.concessivePeriodLabel && (
            <p className="text-[12px] text-fg-muted">Concessivo: {ferias.concessivePeriodLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ferias.isVencida && (
            <SeloDoDP cor="bg-danger/10 text-danger border-danger/25">Vencida</SeloDoDP>
          )}
          <SeloDoDP cor={COR_DAS_FERIAS[ferias.status]}>{SITUACAO_DAS_FERIAS[ferias.status]}</SeloDoDP>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este registro de férias?" onRemover={removeAction} />}
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
              onChange={(e) => setStatus(e.target.value as VacationStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DAS_FERIAS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-40">
            <Input name="startDate" type="date" title="Data de início" aria-label="Data de início" />
          </div>
          <div className="w-full sm:w-40">
            <Input name="returnDate" type="date" title="Data de retorno" aria-label="Data de retorno" />
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
