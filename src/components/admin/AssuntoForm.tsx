"use client";

import { useActionState } from "react";
import type { AssuntoState } from "@/app/(app)/admin/assuntos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { PRAZO_MAXIMO, PRAZO_MINIMO } from "@/lib/solicitacoes/regras";
import { Aviso } from "@/components/ui/Aviso";

export type AssuntoValores = {
  id?: string;
  label?: string;
  description?: string | null;
  sectorCode?: string;
  responseDays?: number;
};

export function AssuntoForm({
  action,
  cancelHref,
  setores,
  valores,
}: {
  action: (prev: AssuntoState, form: FormData) => Promise<AssuntoState>;
  cancelHref: string;
  setores: { value: string; label: string }[];
  valores?: AssuntoValores;
}) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {valores?.id && <input type="hidden" name="id" value={valores.id} />}

      {state?.error && (
        <Aviso>{state.error}</Aviso>
      )}

      <CampoForm label="Assunto" htmlFor="label" required helper="Como o cliente vê na lista. Ex.: Pedir um documento.">
        <Input id="label" name="label" required maxLength={120} defaultValue={valores?.label ?? ""} />
      </CampoForm>

      <CampoForm
        label="Explicação"
        htmlFor="description"
        helper="Uma linha que ajuda o cliente a escolher. Ex.: Contrato social, certidão, guia, balancete…"
      >
        <Input id="description" name="description" maxLength={255} defaultValue={valores?.description ?? ""} />
      </CampoForm>

      <FieldGrid>
        <CampoForm label="Setor que atende" htmlFor="sectorCode" required helper="Mudar o setor vale para as próximas solicitações.">
          <Select id="sectorCode" name="sectorCode" required defaultValue={valores?.sectorCode ?? ""}>
            <option value="">Selecionar…</option>
            {setores.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm
          label="Prazo de resposta (dias úteis)"
          htmlFor="responseDays"
          required
          helper="O cliente vê este prazo ao escolher o assunto."
        >
          <Input
            id="responseDays"
            name="responseDays"
            type="number"
            required
            min={PRAZO_MINIMO}
            max={PRAZO_MAXIMO}
            defaultValue={valores?.responseDays ?? 2}
          />
        </CampoForm>
      </FieldGrid>

      <FormFooter cancelHref={cancelHref} submitLabel={valores?.id ? "Salvar" : "Criar assunto"} pending={isPending} />
    </form>
  );
}
