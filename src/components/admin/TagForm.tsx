"use client";

import { useActionState } from "react";
import type { TagState } from "@/app/(app)/admin/tags/actions";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

export type TagDefaultValues = {
  id?: string;
  sectorCode?: string;
  name?: string;
  color?: string;
};

type Props = {
  action: (prev: TagState, form: FormData) => Promise<TagState>;
  cancelHref: string;
  sectorOptions: { value: string; label: string }[];
  defaultValues?: TagDefaultValues;
};

export function TagForm({ action, cancelHref, sectorOptions, defaultValues }: Props) {
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

      {isEdit && (
        <p className="text-helper text-fg-muted">
          O setor não pode ser alterado após criado — exclua e recrie a tag se precisar mudar.
        </p>
      )}

      {/* Setor e nome lado a lado; na edição, o nome fica sozinho na primeira
          coluna, na mesma largura. */}
      <FieldGrid>
        {!isEdit && (
          <CampoForm label="Setor" htmlFor="sectorCode" required>
            <Select id="sectorCode" name="sectorCode" required>
              <option value="">Selecionar…</option>
              {sectorOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Select>
          </CampoForm>
        )}
        <CampoForm label="Nome da tag" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={defaultValues?.name ?? ""}
            placeholder="Ex: Urgente, Aguardando documento…"
          />
        </CampoForm>
      </FieldGrid>

      {/* O rótulo "Cor" era 12px, menor que o dos campos de cima. */}
      <fieldset>
        <legend className="text-label font-medium text-fg mb-1.5">Cor</legend>
        <div className="flex flex-wrap items-center gap-2">
          {SECTOR_COLOR_PALETTE.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="colorRadio"
                value={c}
                aria-label={`Cor ${c}`}
                defaultChecked={(defaultValues?.color ?? SECTOR_COLOR_PALETTE[0]) === c}
                className="peer sr-only"
                onChange={(e) => {
                  const form = e.currentTarget.closest("form");
                  const colorInput = form?.querySelector<HTMLInputElement>('input[name="color"]');
                  if (colorInput) colorInput.value = c;
                }}
              />
              <span
                className="block w-7 h-7 rounded-full border-2 border-transparent peer-checked:border-fg transition-colors"
                style={{ background: c }}
              />
            </label>
          ))}
          <input type="hidden" name="color" defaultValue={defaultValues?.color ?? SECTOR_COLOR_PALETTE[0]} />
        </div>
      </fieldset>

      <FormFooter
        pending={isPending}
        cancelHref={cancelHref}
      />
    </form>
  );
}
