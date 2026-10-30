"use client";

import { useEnvioQueGuardaNoErro } from "@/components/ui/useEnvioQueGuardaNoErro";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import type { AbsenceState } from "@/app/(app)/pessoas/[id]/afastamentos/actions";
import { AbsenceType } from "@/generated/prisma/enums";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";

const TYPE_LABEL: Record<AbsenceType, string> = {
  FALTA:             "Falta",
  ATESTADO_PARCIAL:  "Atestado parcial",
  ATESTADO_INTEGRAL: "Atestado integral",
  LICENCA:           "Licença",
  AFASTAMENTO:       "Afastamento",
  RETORNO:           "Retorno",
};
const TYPE_OPTIONS = Object.keys(TYPE_LABEL) as AbsenceType[];

type Props = {
  action: (prev: AbsenceState, form: FormData) => Promise<AbsenceState>;
  canEditMedical: boolean;
};

export function AddAfastamentoForm({ action, canEditMedical }: Props) {
  // Pelo `onSubmit`: um erro do servidor não apaga o que já foi digitado.
  const [state, enviar, isPending] = useEnvioQueGuardaNoErro(action);

  // Revisão de alinhamento (30/09): datas e dias na largura do que cabe
  // neles, e o botão alinhado ao campo do lado.
  return (
    <form onSubmit={enviar} className="border-t border-border pt-5 mt-2 space-y-4">
      {/* O bloco do "novo" com nome, acima dos campos: vinha logo abaixo do
          último registro, separado só pelo fio (escolha 5A do Kauan, 08/10/2026). */}
      <h3 className="c41-rotulo">Novo afastamento</h3>
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(2,minmax(0,180px))_120px]">
        <CampoForm label="Tipo" htmlFor="type" required>
          <Select id="type" name="type" required>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Data de início" htmlFor="startDate" required>
          <CampoData id="startDate" name="startDate" required />
        </CampoForm>
        <CampoForm label="Retorno previsto" htmlFor="returnDate">
          <CampoData id="returnDate" name="returnDate" />
        </CampoForm>
        <CampoForm label="Dias perdidos" htmlFor="lostDays">
          <CampoNumero id="lostDays" name="lostDays" min={0} />
        </CampoForm>
      </FieldGrid>

      {canEditMedical && (
        <FieldGrid columns="sm:grid-cols-3">
          <CampoForm label="Motivo" htmlFor="reason">
            <Input id="reason" name="reason" type="text" />
          </CampoForm>
          <CampoForm label="Local de atendimento" htmlFor="location">
            <Input id="location" name="location" type="text" />
          </CampoForm>
          <CampoForm label="Profissional/Conselho" htmlFor="professional">
            <Input id="professional" name="professional" type="text" />
          </CampoForm>
        </FieldGrid>
      )}

      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Registrando…" : "Registrar ausência"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <Aviso>{state.error}</Aviso>}
    </form>
  );
}
