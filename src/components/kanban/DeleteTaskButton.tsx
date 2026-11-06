"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { oQueVaiJunto } from "@/components/kanban/RowActionsMenu";

type Props = {
  entityName: string;
  /** Quantas subatividades, de todos os níveis, vão junto (06/11/2026). */
  subatividades?: number;
  deleteAction: () => Promise<void>;
};

export function DeleteTaskButton({ entityName, subatividades = 0, deleteAction }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleDelete() {
    requestConfirm({ title: `Remover "${entityName}"?`, description: oQueVaiJunto(subatividades), destructive: true, confirmLabel: "Remover" }, deleteAction);
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
