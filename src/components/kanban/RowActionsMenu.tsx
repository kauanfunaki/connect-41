"use client";

import { Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Props = {
  name: string;
  onDelete: () => Promise<void>;
};

// Menu "…" da linha de tarefa na visão de lista. Até aqui excluir uma tarefa
// exigia abrir o detalhe dela — o que, numa lista de dezenas de itens criados
// pelo "Adicionar tarefa", significava um round-trip por exclusão.
//
// Irmão do <Link> do título, não filho: o clique não pode navegar. A linha é
// `draggable`, então o gatilho também para a propagação — sem isso, mirar no
// menu com o mouse já iniciava um arrasto da linha.
export function RowActionsMenu({ name, onDelete }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  return (
    <span
      className="flex-shrink-0"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <Button variant="danger" size="xs" aria-label={`Excluir tarefa ${name}`}
        onClick={() => requestConfirm({ title: `Excluir "${name}"?`, description: "Subtarefas, comentários e anexos vão junto. Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" }, onDelete)}>
        <Trash2 size={12} /> Excluir
      </Button>
      {dialog}
    </span>
  );
}
