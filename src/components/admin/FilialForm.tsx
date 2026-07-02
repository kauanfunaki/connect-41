"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FilialState } from "@/app/(app)/admin/filiais/actions";

export type FilialDefaultValues = {
  id?: string;
  name?: string;
  active?: boolean;
  order?: number;
};

type Props = {
  action: (prev: FilialState, form: FormData) => Promise<FilialState>;
  cancelHref: string;
  defaultValues?: FilialDefaultValues;
};

export function FilialForm({ action, cancelHref, defaultValues }: Props) {
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

      <Field label="Nome da filial *" htmlFor="name">
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Ex: Matriz, Filial Curitiba…"
          className={INPUT}
        />
      </Field>

      {isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ordem" htmlFor="order">
            <input id="order" name="order" type="number" defaultValue={defaultValues?.order ?? 0} className={INPUT} />
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
              <span className="text-[13px] text-fg">Filial ativa</span>
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
  "w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors disabled:opacity-60";
