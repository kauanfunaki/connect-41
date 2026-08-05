"use client";

import { useActionState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { ConferenciaState } from "@/app/(app)/pessoas/[id]/desligamento/[terminationId]/conferencia/actions";

type Props = {
  action: (prev: ConferenciaState, form: FormData) => Promise<ConferenciaState>;
  defaults: { terminationDate: string; noticeType: string };
  canEdit: boolean;
};

const NOTICE_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "INDENIZADO", label: "Indenizado" },
  { value: "TRABALHADO", label: "Trabalhado" },
  { value: "DISPENSADO", label: "Dispensado" },
  { value: "NAO_APLICAVEL", label: "Não se aplica" },
];

export function DadosRescisaoForm({ action, defaults, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-[200px_200px_auto] gap-3 items-end">
      <CampoForm
        label="Data do término do contrato"
        htmlFor="terminationDate"
        helper="Base do prazo legal de pagamento."
      >
        <Input
          id="terminationDate"
          name="terminationDate"
          type="date"
          defaultValue={defaults.terminationDate}
          disabled={!canEdit}
        />
      </CampoForm>

      <CampoForm label="Aviso prévio" htmlFor="noticeType">
        <Select id="noticeType" name="noticeType" defaultValue={defaults.noticeType} disabled={!canEdit}>
          {NOTICE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </CampoForm>

      {canEdit && (
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md border border-border-strong bg-surface-hover text-fg text-[13px] font-medium hover:border-brand disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      )}

      {state?.error && <p className="text-[13px] text-danger sm:col-span-3">{state.error}</p>}
    </form>
  );
}
