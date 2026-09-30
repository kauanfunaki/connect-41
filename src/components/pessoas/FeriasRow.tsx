"use client";

import { useActionState, useState } from "react";
import type { VacationState } from "@/app/(app)/pessoas/[id]/ferias/actions";
import type { VacationStatus } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { MenuDoRegistro } from "./MenuDoRegistro";
import { SITUACAO_DAS_FERIAS, COR_DAS_FERIAS } from "./rotulosDoDP";

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
        <div>
          <p className="text-[13px] text-fg">
            Aquisitivo: {ferias.acquisitivePeriodLabel} · {ferias.days} dias
          </p>
          {ferias.concessivePeriodLabel && (
            <p className="text-[12px] text-fg-muted">Concessivo: {ferias.concessivePeriodLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {ferias.isVencida && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-danger/10 text-danger border-danger/25">
              Vencida
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${COR_DAS_FERIAS[ferias.status]}`}>
            {SITUACAO_DAS_FERIAS[ferias.status]}
          </span>
          {/* Remover saiu de ao lado do "Atualizar" para o "⋯" (30/09). */}
          {canManage && <MenuDoRegistro titulo="Remover este registro de férias?" onRemover={removeAction} />}
        </div>
      </div>

      {canManage && (
        <form action={formAction} className="flex items-end gap-2 flex-wrap mt-2">
          <div className="w-44">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as VacationStatus)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{SITUACAO_DAS_FERIAS[s]}</option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Input name="startDate" type="date" title="Data de início" />
          </div>
          <div className="w-40">
            <Input name="returnDate" type="date" title="Data de retorno" />
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
