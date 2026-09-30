"use client";

import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
  enabled: boolean;
  nome: string;
};

export function ToggleModuleButton({ action, enabled, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = enabled ? `Desativar o módulo "${nome}" para este tenant?` : `Ativar o módulo "${nome}" para este tenant?`;
    const description = enabled ? "Ele desaparece do menu e das rotas até ser reativado." : undefined;
    requestConfirm({ title, description, destructive: enabled, confirmLabel: enabled ? "Desativar" : "Ativar" }, action);
  }

  return (
    <>
      {/* Largura fixa: "Ativar" e "Desativar" têm tamanhos diferentes, e o
          select ao lado mudava de posição de uma linha para outra. */}
      <Button
        variant={enabled ? "danger" : "success"}
        size="sm"
        className="w-24"
        onClick={handleClick}
      >
        {enabled ? "Desativar" : "Ativar"}
      </Button>
      {dialog}
    </>
  );
}
