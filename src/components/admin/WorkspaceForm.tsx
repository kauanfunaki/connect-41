"use client";

import { useActionState } from "react";
import type { WorkspaceState } from "@/app/(app)/admin/workspaces/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

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

      {/* CNPJ na mesma linha, na largura dele: tem 18 caracteres. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_14rem]">
        <CampoForm label="Nome do cliente" htmlFor="name" required>
          <Input id="name" name="name" type="text" required placeholder="Razão Social do cliente" />
        </CampoForm>
        <CampoForm label="CNPJ" htmlFor="cnpj" required>
          <Input id="cnpj" name="cnpj" type="text" required placeholder="00.000.000/0000-00" />
        </CampoForm>
      </FieldGrid>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button href={cancelHref} variant="secondary">
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando…" : "Criar Workspace"}
        </Button>
      </div>
    </form>
  );
}
