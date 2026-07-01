"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { CampoState } from "@/app/(app)/admin/campos/actions";
import type { CustomFieldType, EntityType } from "@/generated/prisma/enums";

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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Setor *" htmlFor="sectorCode">
            <select id="sectorCode" name="sectorCode" required className={INPUT}>
              <option value="">Selecionar…</option>
              {sectorOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Aplica-se a *" htmlFor="entityType">
            <select id="entityType" name="entityType" required defaultValue="COMPANY" className={INPUT}>
              <option value="COMPANY">Empresas</option>
              <option value="PERSON">Pessoas</option>
            </select>
          </Field>
        </div>
      )}

      {isEdit && (
        <p className="text-[12px] text-fg-muted">
          Setor e tipo de entidade não podem ser alterados após criado — exclua e recrie o campo se precisar mudar.
        </p>
      )}

      <Field label="Nome do campo *" htmlFor="label">
        <input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={defaultValues?.label ?? ""}
          placeholder="Ex: Data de admissão, Faixa salarial…"
          className={INPUT}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo do campo *" htmlFor="fieldType">
          <select
            id="fieldType"
            name="fieldType"
            required
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
            className={INPUT}
          >
            {FIELD_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Obrigatório" htmlFor="required">
          <label className="flex items-center gap-2 h-9">
            <input
              id="required"
              name="required"
              type="checkbox"
              defaultChecked={defaultValues?.required ?? false}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-[13px] text-fg">Preenchimento obrigatório</span>
          </label>
        </Field>
      </div>

      {fieldType === "SELECT" && (
        <Field label="Opções (separadas por vírgula) *" htmlFor="options">
          <input
            id="options"
            name="options"
            type="text"
            defaultValue={(defaultValues?.options ?? []).join(", ")}
            placeholder="Ex: Baixo, Médio, Alto"
            className={INPUT}
          />
        </Field>
      )}

      {isEdit && (
        <Field label="Ordem" htmlFor="order">
          <input
            id="order"
            name="order"
            type="number"
            defaultValue={defaultValues?.order ?? 0}
            className={INPUT}
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

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT =
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors disabled:opacity-60";
