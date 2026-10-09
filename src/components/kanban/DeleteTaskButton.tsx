"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
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
      <Button variant="danger" size="xs" onClick={handleDelete}>
        <Trash2 size={13} /> Excluir tarefa
      </Button>
      {dialog}
    </>
  );
}
