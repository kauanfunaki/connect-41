"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { Input } from "@/components/ui/Input";
import type { CompetencyState } from "@/app/(app)/admin/competencias/actions";
import { FormFooter } from "@/components/ui/FormFooter";

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
        {/* Mesmas colunas do cadastro acima, para a linha em edição não mudar
            de forma; Cancelar antes de Salvar, como nos demais formulários. */}
        <div className="grid grid-cols-1 sm:grid-cols-[14rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2">
          <Input name="name" defaultValue={competencia.name} required aria-label="Nome da competência" />
          <Input
            name="description"
            defaultValue={competencia.description ?? ""}
            placeholder="Descrição"
            aria-label="Descrição"
          />
          <FormFooter
            pending={isPending}
            onCancel={() => setEditing(false)}
            semDivisoria
          />
        </div>
        {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-fg">{competencia.name}</p>
        {competencia.description && <p className="text-[12px] text-fg-muted">{competencia.description}</p>}
      </div>
      {/* Editar é botão e Excluir vai no "⋯" (polimento de 30/09). */}
      <AcoesDoItem
        className="flex-shrink-0"
        editar={() => setEditing(true)}
        excluir={{ action: deleteAction, titulo: `Excluir a competência "${competencia.name}"?` }}
      />
    </div>
  );
}
