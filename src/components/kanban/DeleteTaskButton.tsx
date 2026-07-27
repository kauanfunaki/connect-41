"use client";

import { MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  entityName: string;
  deleteAction: () => Promise<void>;
};

export function DeleteTaskButton({ entityName, deleteAction }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleDelete() {
    requestConfirm({ title: `Remover "${entityName}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Remover" }, deleteAction);
  }

  return (
    <>
      <Dropdown
        align="right"
        width={180}
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label="Mais opções"
            className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            <MoreHorizontal size={16} />
          </button>
        )}
      >
        <DropdownItem danger onClick={handleDelete}>
          Excluir tarefa
        </DropdownItem>
      </Dropdown>
      {dialog}
    </>
  );
}
