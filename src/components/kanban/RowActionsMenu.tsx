"use client";

import { MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  name: string;
  onDelete: () => Promise<void>;
};

// Menu "…" da linha de tarefa na visão de lista. Até aqui excluir uma tarefa
// exigia abrir o detalhe dela — o que, numa lista de dezenas de itens criados
// pelo "+ Adicionar Tarefa", significava um round-trip por exclusão.
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
      <Dropdown
        align="right"
        width={180}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={`Opções de ${name}`}
            className="p-0.5 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      >
        <DropdownItem
          danger
          onClick={() =>
            requestConfirm(
              {
                title: `Excluir "${name}"?`,
                description: "Subtarefas, comentários e anexos vão junto. Esta ação não pode ser desfeita.",
                destructive: true,
                confirmLabel: "Excluir",
              },
              onDelete
            )
          }
        >
          Excluir tarefa
        </DropdownItem>
      </Dropdown>
      {dialog}
    </span>
  );
}
