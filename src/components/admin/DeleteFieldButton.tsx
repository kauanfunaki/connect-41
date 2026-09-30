"use client";

import { Trash2 } from "lucide-react";
import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
  nome: string;
};

export function DeleteFieldButton({ action, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    requestConfirm(
      { title: `Excluir o campo "${nome}"?`, description: "Todos os valores preenchidos nele serão perdidos.", destructive: true, confirmLabel: "Excluir" },
      action
    );
  }

  // Botão de verdade, e não texto vermelho (polimento de 30/09: "botão não é
  // link"). Serve às telas de fora da Administração que ainda o usam — nas
  // listas de admin a exclusão foi para o "⋯" de `AcoesDoItem`.
  return (
    <>
      <Button variant="danger" size="xs" onClick={handleClick}>
        <Trash2 size={11} /> Excluir
      </Button>
      {dialog}
    </>
  );
}
