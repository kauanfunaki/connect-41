"use client";

import { Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/useConfirm";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { Button } from "@/components/ui/Button";

type Props = {
  /** Como o item se chama no texto do diálogo: "espaço", "pasta", "lista". */
  kind: string;
  name: string;
  action: () => Promise<PipelineState>;
};

// Menu "…" de excluir para Espaço / Pasta / Lista. Nos três casos o card
// inteiro é um <Link>, então este menu é renderizado como IRMÃO dele, posicionado
// por cima — nunca dentro. Um <button> dentro de um <a> é HTML inválido e, na
// prática, o clique no menu também navegaria.
//
// A action devolve { error } em vez de lançar: erro lançado em server action é
// mascarado pelo Next em produção ("An error occurred in the Server Components
// render"), e a mensagem aqui é justamente o que explica por que não deu
// ("Esvazie o espaço antes…"). O throw acontece no cliente, onde o useConfirm
// consegue mostrar o texto real.
export function DeleteEntityMenu({ kind, name, action }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleDelete() {
    requestConfirm(
      {
        title: `Excluir ${kind} "${name}"?`,
        description: "Esta ação não pode ser desfeita.",
        destructive: true,
        confirmLabel: "Excluir",
      },
      async () => {
        const res = await action();
        if (res?.error) throw new Error(res.error);
      }
    );
  }

  return (
    <>
      <Button variant="danger" size="xs" onClick={handleDelete} aria-label={`Excluir ${kind} ${name}`}>
        <Trash2 size={12} /> Excluir
      </Button>
      {dialog}
    </>
  );
}
