"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { WorkspaceState } from "@/app/(app)/admin/workspaces/actions";

type Props = {
  action: (prev: WorkspaceState, form: FormData) => Promise<WorkspaceState>;
  cancelHref: string;
};

export function WorkspaceForm({ action, cancelHref }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <Field label="Nome do cliente *" htmlFor="name">
        <input id="name" name="name" type="text" required placeholder="Razão Social do cliente" className={INPUT} />
      </Field>

      <Field label="CNPJ *" htmlFor="cnpj">
        <input id="cnpj" name="cnpj" type="text" required placeholder="00.000.000/0000-00" className={INPUT} />
      </Field>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Criando…" : "Criar Workspace"}
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
