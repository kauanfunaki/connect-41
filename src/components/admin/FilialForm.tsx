"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { FilialState } from "@/app/(app)/admin/filiais/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";

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

      <CampoForm label="Nome da filial" htmlFor="name" required>
        <Input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={defaultValues?.name ?? ""}
          placeholder="Ex: Matriz, Filial Curitiba…"
        />
      </CampoForm>

      {isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <CampoForm label="Ordem" htmlFor="order">
            <Input id="order" name="order" type="number" defaultValue={defaultValues?.order ?? 0} />
          </CampoForm>
          <CampoForm label="Status" htmlFor="active">
            <div className="h-9 flex items-center">
              <Checkbox
                id="active"
                name="active"
                defaultChecked={defaultValues?.active ?? true}
                label="Filial ativa"
              />
            </div>
          </CampoForm>
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
