"use client";

import { useActionState } from "react";
import type { WorkShiftState } from "@/app/(app)/empresas/[id]/turnos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";

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
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Horário na largura de um horário: em três terços iguais, o "08:00"
          ficava do tamanho do nome do turno. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_140px] gap-4">
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

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
