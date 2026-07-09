"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";

type Props = {
  competencia: { id: string; name: string; description: string | null };
  updateAction: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
  deleteAction: () => Promise<void>;
};

// Edição inline (sem rota dedicada) — lista de competências é simples o
// bastante (nome + descrição) pra não justificar uma tela /editar própria.
export function CompetenciaRow({ competencia, updateAction, deleteAction }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(updateAction, null);
  const wasPending = useRef(false);

  // useActionState não tem callback de sucesso — fecha o modo de edição
  // observando a transição pending:true -> false sem erro (mesmo padrão de
  // "onSuccess" manual usado nos outros formulários client-side do app).
  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) {
      setEditing(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  if (editing) {
    return (
      <form action={formAction} className="px-4 py-2.5 space-y-2">
        <input type="hidden" name="id" value={competencia.id} />
        <div className="flex items-center gap-2 flex-wrap">
          <input
            name="name"
            defaultValue={competencia.name}
            required
            className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand"
          />
          <input
            name="description"
            defaultValue={competencia.description ?? ""}
            placeholder="Descrição"
            className="h-8 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand flex-1 min-w-[160px]"
          />
          <button
            type="submit"
            disabled={isPending}
            className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <p className="text-[13px] text-fg">{competencia.name}</p>
        {competencia.description && <p className="text-[12px] text-fg-muted">{competencia.description}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[12px] text-fg-muted hover:text-fg transition-colors"
        >
          Editar
        </button>
        <DeleteFieldButton action={deleteAction} nome={competencia.name} />
      </div>
    </div>
  );
}
