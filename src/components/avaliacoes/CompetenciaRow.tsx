"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { Input } from "@/components/ui/Input";
import type { CompetencyState } from "@/app/(app)/avaliacoes/actions";
import { FormFooter } from "@/components/ui/FormFooter";

/**
 * As colunas da aba Competências: nome, descrição, uso e as ações. O cabeçalho
 * da lista usa as mesmas, para as linhas formarem uma tabela (escolha 8A,
 * 20/10/2026). Era nome e descrição numa ponta, Editar na outra e um vão no
 * meio. Sem quem edite, a coluna das ações sai.
 */
export function colunasDasCompetencias(comAcoes: boolean) {
  return comAcoes
    ? "sm:grid-cols-[14rem_minmax(0,1fr)_9rem_8rem]"
    : "sm:grid-cols-[14rem_minmax(0,1fr)_9rem]";
}

type Props = {
  competencia: { id: string; name: string; description: string | null };
  /** Em quantas avaliações a competência já recebeu nota. */
  usos: number;
  /** Sem a ação, a linha é só leitura (quem não gere o módulo). */
  updateAction?: (prev: CompetencyState, form: FormData) => Promise<CompetencyState>;
  /** Só do administrador, e só da competência que nenhuma avaliação usa: as notas dadas prendem a competência. */
  deleteAction?: () => Promise<void>;
};

export function usoDaCompetencia(usos: number) {
  if (usos === 0) return "Ainda não usada";
  return `${usos} avaliaç${usos === 1 ? "ão" : "ões"}`;
}

// Edição inline (sem rota dedicada) — lista de competências é simples o
// bastante (nome + descrição) pra não justificar uma tela /editar própria.
export function CompetenciaRow({ competencia, usos, updateAction, deleteAction }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateAction ?? (async () => null),
    null
  );
  const wasPending = useRef(false);
  const comAcoes = Boolean(updateAction || deleteAction);

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
        {/* A coluna do nome é a mesma da linha, para a edição não mudar de
            forma; Cancelar antes de Salvar, como nos demais formulários. */}
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
        {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${colunasDasCompetencias(comAcoes)} items-center gap-x-4 gap-y-1 px-4 py-2.5`}>
      <p className="min-w-0 text-fs-3 font-medium text-fg">{competencia.name}</p>
      <p className="min-w-0 text-fs-2 text-fg-muted">{competencia.description || "—"}</p>
      <p className="text-fs-2 text-fg-secondary">{usoDaCompetencia(usos)}</p>
      {/* Editar é botão e Excluir vai no "⋯" (polimento de 30/09). */}
      {comAcoes && (
        <AcoesDoItem
          className="sm:justify-self-end"
          editar={updateAction ? () => setEditing(true) : undefined}
          excluir={deleteAction ? { action: deleteAction, titulo: `Excluir a competência "${competencia.name}"?` } : undefined}
        />
      )}
    </div>
  );
}
