"use client";

import { useActionState } from "react";
import type { TerminationState } from "@/app/(app)/pessoas/[id]/desligamento/actions";
import { TerminationType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TYPE_LABEL: Record<TerminationType, string> = {
  VOLUNTARIO:        "Voluntário",
  INVOLUNTARIO:      "Involuntário",
  TERMINO_CONTRATO:  "Término de contrato",
  EXPERIENCIA:       "Experiência",
  JUSTA_CAUSA:       "Justa causa",
  SEM_JUSTA_CAUSA:   "Sem justa causa",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as TerminationType[];

type Props = {
  action: (prev: TerminationState, form: FormData) => Promise<TerminationState>;
};

export function AddDesligamentoForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="border-t border-border pt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-56">
          <CampoForm label="Tipo" htmlFor="type" required>
            <Select id="type" name="type" required>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
        <div className="flex-1 min-w-[200px]">
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <CampoForm label="Observações" htmlFor="notes">
            <Input id="notes" name="notes" type="text" />
          </CampoForm>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Registrando…" : "Registrar Desligamento"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
