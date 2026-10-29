"use client";

import { useActionState } from "react";
import type { SetorState } from "@/app/(app)/admin/setores/actions";
import { SeletorDeCor } from "@/components/ui/SeletorDeCor";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

export type SetorDefaultValues = {
  id?: string;
  code?: string;
  label?: string;
  color?: string;
  active?: boolean;
  order?: number;
  companyFocus?: boolean | null;
};

type Props = {
  action: (prev: SetorState, form: FormData) => Promise<SetorState>;
  cancelHref: string;
  defaultValues?: SetorDefaultValues;
  /** As telas deste setor seguem a empresa em foco (`setoresDoFoco`). */
  focoDisponivel?: boolean;
};

export function SetorForm({ action, cancelHref, defaultValues, focoDisponivel = false }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      {/* O código interno do setor (o slug) não aparece: não se edita e não diz
          nada a quem usa (Ajustes de 27/10/2026). */}
      <CampoForm label="Nome do setor" htmlFor="label" required>
        <Input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={defaultValues?.label ?? ""}
          placeholder="Ex: Trabalhista, Marketing…"
        />
      </CampoForm>

      <fieldset>
        <legend className="text-label font-medium text-fg mb-1.5">Cor</legend>
        <SeletorDeCor name="color" valorInicial={defaultValues?.color} corLivre={false} aria-label="Cor do setor" />
      </fieldset>

      {/* Ordem é um número de um ou dois dígitos: coluna estreita. A caixa de
          "ativo" dispensa o rótulo "Status" em cima — o dela já diz tudo. */}
      {isEdit && (
        <FieldGrid columns="sm:grid-cols-[8rem_minmax(0,1fr)]">
          <CampoForm label="Ordem" htmlFor="order">
            <Input
              id="order"
              name="order"
              type="number"
              defaultValue={defaultValues?.order ?? 0}
            />
          </CampoForm>
          <AlinhadoAoCampo>
            <Checkbox
              id="active"
              name="active"
              defaultChecked={defaultValues?.active ?? true}
              label="Setor ativo"
            />
          </AlinhadoAoCampo>
        </FieldGrid>
      )}

      {/* A chave do foco (29/10/2026): sempre à vista, desabilitada com o
          motivo onde as telas do setor ainda não seguem a empresa. */}
      {isEdit && (
        <Checkbox
          id="companyFocus"
          name="companyFocus"
          defaultChecked={focoDisponivel && defaultValues?.companyFocus !== false}
          disabled={!focoDisponivel}
          label="Trabalhar numa empresa por vez"
          helper={
            focoDisponivel
              ? "Quem é do setor escolhe uma empresa no topo (ou na ficha dela), e as telas passam a mostrar e gravar só ela, com a matriz e as filiais."
              : "As telas deste setor ainda não seguem a empresa escolhida. Hoje, só as telas do BPO seguem."
          }
        />
      )}

      <FormFooter
        pending={isPending}
        cancelHref={cancelHref}
      />
    </form>
  );
}
