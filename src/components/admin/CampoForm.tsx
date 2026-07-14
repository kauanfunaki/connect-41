"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CampoState } from "@/app/(app)/admin/campos/actions";
import type { CustomFieldType, EntityType } from "@/generated/prisma/enums";
import { CampoForm as Field } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {!isEdit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>
      )}

      {isEdit && (
        <p className="text-[12px] text-fg-muted">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        <Field label="Obrigatório" htmlFor="required">
          <div className="h-9 flex items-center">
            <Checkbox
              id="required"
              name="required"
              defaultChecked={defaultValues?.required ?? false}
              label="Preenchimento obrigatório"
            />
          </div>
        </Field>
      </div>

      {fieldType === "SELECT" && (
        <Field label="Opções (separadas por vírgula)" htmlFor="options" required>
          <Input
            id="options"
            name="options"
            type="text"
            defaultValue={(defaultValues?.options ?? []).join(", ")}
            placeholder="Ex: Baixo, Médio, Alto"
          />
        </Field>
      )}

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

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
