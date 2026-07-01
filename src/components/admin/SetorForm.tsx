"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { SetorState } from "@/app/(app)/admin/setores/actions";
import { SECTOR_COLOR_PALETTE } from "@/lib/sector-constants";

export type SetorDefaultValues = {
  id?: string;
  code?: string;
  label?: string;
  color?: string;
  active?: boolean;
  order?: number;
};

type Props = {
  action: (prev: SetorState, form: FormData) => Promise<SetorState>;
  cancelHref: string;
  defaultValues?: SetorDefaultValues;
};

export function SetorForm({ action, cancelHref, defaultValues }: Props) {
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

      <Field label="Nome do setor *" htmlFor="label">
        <input
          id="label"
          name="label"
          type="text"
          required
          defaultValue={defaultValues?.label ?? ""}
          placeholder="Ex: Trabalhista, Marketing…"
          className={INPUT}
        />
      </Field>

      {isEdit && defaultValues?.code && (
        <Field label="Código" htmlFor="code">
          <input id="code" type="text" value={defaultValues.code} disabled className={`${INPUT} font-mono`} />
          <p className="text-[11px] text-fg-muted mt-1">
            Gerado a partir do nome na criação — não pode ser alterado (já é usado em pipelines, usuários e handoffs).
          </p>
        </Field>
      )}

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

      {isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ordem" htmlFor="order">
            <input
              id="order"
              name="order"
              type="number"
              defaultValue={defaultValues?.order ?? 0}
              className={INPUT}
            />
          </Field>
          <Field label="Status" htmlFor="active">
            <label className="flex items-center gap-2 h-9">
              <input
                id="active"
                name="active"
                type="checkbox"
                defaultChecked={defaultValues?.active ?? true}
                className="w-4 h-4 rounded border-border"
              />
              <span className="text-[13px] text-fg">Setor ativo</span>
            </label>
          </Field>
        </div>
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
