"use client";

import { useActionState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ConferenciaState } from "@/app/(app)/pessoas/[id]/desligamento/[terminationId]/conferencia/actions";

type Props = {
  action: (prev: ConferenciaState, form: FormData) => Promise<ConferenciaState>;
  defaults: {
    terminationDate: string;
    noticeType: string;
    fgtsBalanceInformed: string;
    thirteenthAdvancePaid: string;
    unjustifiedAbsences: string;
    apprentice: boolean;
  };
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
    <form action={formAction} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
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

      {/* Insumos que o Connect não tem como obter sozinho. Sem eles as verbas
          correspondentes ficam "sem referência" em vez de sair com número
          chutado. Campo vazio = não informado (≠ zero). */}
      <CampoForm
        label="Saldo do FGTS"
        htmlFor="fgtsBalanceInformed"
        helper="Extrato da CAIXA — base da multa rescisória."
      >
        <Input
          id="fgtsBalanceInformed"
          name="fgtsBalanceInformed"
          type="text"
          inputMode="decimal"
          defaultValue={defaults.fgtsBalanceInformed}
          placeholder="0,00"
          disabled={!canEdit}
        />
      </CampoForm>

      <CampoForm label="13º já adiantado" htmlFor="thirteenthAdvancePaid">
        <Input
          id="thirteenthAdvancePaid"
          name="thirteenthAdvancePaid"
          type="text"
          inputMode="decimal"
          defaultValue={defaults.thirteenthAdvancePaid}
          placeholder="0,00"
          disabled={!canEdit}
        />
      </CampoForm>

      <CampoForm
        label="Faltas injustificadas"
        htmlFor="unjustifiedAbsences"
        helper="No período aquisitivo — reduz os dias de férias (art. 130)."
      >
        <Input
          id="unjustifiedAbsences"
          name="unjustifiedAbsences"
          type="number"
          min={0}
          defaultValue={defaults.unjustifiedAbsences}
          placeholder="0"
          disabled={!canEdit}
        />
      </CampoForm>

      <div className="sm:col-span-3 flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border">
        <Checkbox
          name="apprentice"
          value="true"
          defaultChecked={defaults.apprentice}
          disabled={!canEdit}
          label="Contrato de aprendiz (FGTS de 2% em vez de 8%)"
        />
        {canEdit && (
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-4 rounded-md border border-border-strong bg-surface-hover text-fg text-[13px] font-medium hover:border-brand disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar dados"}
          </button>
        )}
      </div>

      {state?.error && <p className="text-[13px] text-danger sm:col-span-3">{state.error}</p>}
    </form>
  );
}
