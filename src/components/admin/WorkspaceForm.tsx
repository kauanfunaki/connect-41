"use client";

import { useActionState } from "react";
import Link from "next/link";
import type { WorkspaceState } from "@/app/(app)/admin/workspaces/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";

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

      <CampoForm label="Nome do cliente" htmlFor="name" required>
        <Input id="name" name="name" type="text" required placeholder="Razão Social do cliente" />
      </CampoForm>

      <CampoForm label="CNPJ" htmlFor="cnpj" required>
        <Input id="cnpj" name="cnpj" type="text" required placeholder="00.000.000/0000-00" />
      </CampoForm>

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
