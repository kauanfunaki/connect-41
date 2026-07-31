"use client";

import { MoreHorizontal } from "lucide-react";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { IconButton } from "@/components/ui/IconButton";
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
          <IconButton onClick={toggle} aria-expanded={open} aria-label="Mais opções">
            <MoreHorizontal size={16} />
          </IconButton>
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
