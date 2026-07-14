"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { TagState } from "@/app/(app)/admin/tags/actions";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

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
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {!isEdit ? (
        <CampoForm label="Setor" htmlFor="sectorCode" required>
          <Select id="sectorCode" name="sectorCode" required>
            <option value="">Selecionar…</option>
            {sectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </CampoForm>
      ) : (
        <p className="text-[12px] text-fg-muted">
          O setor não pode ser alterado após criado — exclua e recrie a tag se precisar mudar.
        </p>
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

      <div className="space-y-2">
        <p className="text-[12px] font-medium text-fg">Cor</p>
        <div className="flex flex-wrap items-center gap-2">
          {SECTOR_COLOR_PALETTE.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="colorRadio"
                value={c}
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
      </div>

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
