"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { HolidayState } from "@/app/(app)/admin/feriados/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

type Props = {
  action: (prev: HolidayState, form: FormData) => Promise<HolidayState>;
};

export function AddFeriadoForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex items-end gap-3 flex-wrap mb-6">
      <div className="w-40">
        <CampoForm label="Data" htmlFor="date" required>
          <Input id="date" name="date" type="date" required />
        </CampoForm>
      </div>
      <div className="w-56">
        <CampoForm label="Nome do Feriado" htmlFor="name" required>
          <Input id="name" name="name" type="text" required />
        </CampoForm>
      </div>
      <Button
        type="submit"
        disabled={isPending}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        {isPending ? "Cadastrando…" : "Cadastrar Feriado"}
     </Button>
      {state?.error && <p className="text-[13px] text-danger w-full">{state.error}</p>}
    </form>
  );
}
