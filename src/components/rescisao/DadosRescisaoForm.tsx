"use client";

import { useActionState } from "react";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import type { ConferenciaState } from "@/app/(app)/pessoas/[id]/desligamento/[terminationId]/conferencia/actions";
import { Button } from "@/components/ui/Button";

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
    <form action={formAction} className="space-y-4">
      {/* Era uma grade de 3 com `items-end`: o campo sem texto de ajuda (Aviso
          prévio) descia até o pé do texto de ajuda dos vizinhos e ficava fora
          da linha deles. Agora os rótulos alinham no topo, as duas linhas
          fecham cheias — o contrato em cima, os insumos da contabilidade
          embaixo — e o "Salvar" foi para o rodapé. */}
      <FieldGrid columns="sm:grid-cols-3">
        <CampoForm label="Término do contrato" htmlFor="terminationDate" helper="Base do prazo legal de pagamento.">
          <CampoData
            id="terminationDate"
            name="terminationDate"
           
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

        <AlinhadoAoCampo>
          <Checkbox
            name="apprentice"
            value="true"
            defaultChecked={defaults.apprentice}
            disabled={!canEdit}
            label={
              <>
                Contrato de aprendiz <span className="text-fg-muted">(FGTS de 2%)</span>
              </>
            }
          />
        </AlinhadoAoCampo>

        {/* Insumos que o Connect não tem como obter sozinho. Sem eles as verbas
            correspondentes ficam "sem referência" em vez de sair com número
            chutado. Campo vazio = não informado (≠ zero). */}
        <CampoForm label="Saldo do FGTS" htmlFor="fgtsBalanceInformed" helper="Extrato da CAIXA — base da multa rescisória.">
          <Input
            id="fgtsBalanceInformed"
            name="fgtsBalanceInformed"
            type="text"
            inputMode="decimal"
            prefix="R$"
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
            prefix="R$"
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
      </FieldGrid>

      {(canEdit || state?.error) && (
        <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">
          {state?.error && <p className="mr-auto text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
          {canEdit && (
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando…" : "Salvar dados"}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
