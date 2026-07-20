"use client";

import { useActionState } from "react";
import type { DepartmentState } from "@/app/(app)/empresas/[id]/departamentos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";

type Props = {
  action: (prev: DepartmentState, form: FormData) => Promise<DepartmentState>;
  companyId: string;
  cancelHref: string;
  defaultValues?: { id?: string; name?: string };
};

export function DepartmentForm({ action, companyId, cancelHref, defaultValues }: Props) {
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

      <CampoForm label="Nome do Departamento" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
        />
      </CampoForm>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
