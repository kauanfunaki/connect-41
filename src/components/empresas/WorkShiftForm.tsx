"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { WorkShiftState } from "@/app/(app)/empresas/[id]/turnos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

export type WorkShiftDefaultValues = {
  id?: string;
  name?: string;
  startTime?: string;
  endTime?: string;
};

type Props = {
  action: (prev: WorkShiftState, form: FormData) => Promise<WorkShiftState>;
  companyId: string;
  cancelHref: string;
  defaultValues?: WorkShiftDefaultValues;
};

export function WorkShiftForm({ action, companyId, cancelHref, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-4">
        <CampoForm label="Nome do Turno" htmlFor="name" required>
          <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
        </CampoForm>
        <CampoForm label="Início" htmlFor="startTime" required>
          <Input id="startTime" name="startTime" type="time" required defaultValue={defaultValues?.startTime ?? ""} />
        </CampoForm>
        <CampoForm label="Fim" htmlFor="endTime" required>
          <Input id="endTime" name="endTime" type="time" required defaultValue={defaultValues?.endTime ?? ""} />
        </CampoForm>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link href={cancelHref} className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
