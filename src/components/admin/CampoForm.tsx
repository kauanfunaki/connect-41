"use client";

import { useActionState, useState } from "react";
import type { CampoState } from "@/app/(app)/admin/campos/actions";
import type { CustomFieldType, EntityType } from "@/generated/prisma/enums";
import { AlinhadoAoCampo, CampoForm as Field } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: "TEXT", label: "Texto curto" },
  { value: "TEXTAREA", label: "Texto longo" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Data" },
  { value: "SELECT", label: "Seleção (lista fixa)" },
  { value: "BOOLEAN", label: "Sim / Não" },
];

export type CampoDefaultValues = {
  id?: string;
  sectorCode?: string;
  entityType?: EntityType;
  label?: string;
  fieldType?: CustomFieldType;
  options?: string[];
  required?: boolean;
  order?: number;
};

type Props = {
  action: (prev: CampoState, form: FormData) => Promise<CampoState>;
  cancelHref: string;
  sectorOptions: { value: string; label: string }[];
  defaultValues?: CampoDefaultValues;
};

export function CampoForm({ action, cancelHref, sectorOptions, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const isEdit = Boolean(defaultValues?.id);
  const [fieldType, setFieldType] = useState<CustomFieldType>(defaultValues?.fieldType ?? "TEXT");

  return (
    <form action={formAction} className="space-y-6">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      {!isEdit && (
        <FieldGrid>
          <Field label="Setor" htmlFor="sectorCode" required>
            <Select id="sectorCode" name="sectorCode" required>
              <option value="">Selecionar…</option>
              {sectorOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Aplica-se a" htmlFor="entityType" required>
            <Select id="entityType" name="entityType" required defaultValue="COMPANY">
              <option value="COMPANY">Empresas</option>
              <option value="PERSON">Pessoas</option>
            </Select>
          </Field>
        </FieldGrid>
      )}

      {isEdit && (
        <p className="text-helper text-fg-muted">
          Setor e tipo de entidade não podem ser alterados após criado — exclua e recrie o campo se precisar mudar.
        </p>
      )}

      <Field label="Nome do campo" htmlFor="label" required>
        <Input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={defaultValues?.label ?? ""}
          placeholder="Ex: Data de admissão, Faixa salarial…"
        />
      </Field>

      {/* A caixa de "obrigatório" dispensa o rótulo em cima; a ordem (só na
          edição) é um número curto e ganha coluna estreita na mesma linha. */}
      <FieldGrid columns={isEdit ? "sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,1fr)]" : "sm:grid-cols-2"}>
        <Field label="Tipo do campo" htmlFor="fieldType" required>
          <Select
            id="fieldType"
            name="fieldType"
            required
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
          >
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </Field>
        {isEdit && (
          <Field label="Ordem" htmlFor="order">
            <Input
              id="order"
              name="order"
              type="number"
              defaultValue={defaultValues?.order ?? 0}
            />
          </Field>
        )}
        <AlinhadoAoCampo>
          <Checkbox
            id="required"
            name="required"
            defaultChecked={defaultValues?.required ?? false}
            label="Preenchimento obrigatório"
          />
        </AlinhadoAoCampo>
      </FieldGrid>

      {fieldType === "SELECT" && (
        <Field label="Opções" htmlFor="options" required helper="Separadas por vírgula.">
          <Input
            id="options"
            name="options"
            type="text"
            defaultValue={(defaultValues?.options ?? []).join(", ")}
            placeholder="Ex: Baixo, Médio, Alto"
          />
        </Field>
      )}

      <FormFooter
        pending={isPending}
        cancelHref={cancelHref}
      />
    </form>
  );
}
