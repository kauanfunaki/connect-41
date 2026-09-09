"use client";

import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
  active: boolean;
  nome: string;
};

export function TogglePlanoButton({ action, active, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = active ? `Desativar o plano "${nome}"?` : `Reativar o plano "${nome}" pra novas assinaturas?`;
    const description = active ? "Ele some das opções pra novas assinaturas, mas assinaturas existentes continuam." : undefined;
    requestConfirm({ title, description, destructive: active, confirmLabel: active ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      <Button
        variant={active ? "danger" : "success"}
        size="sm"
        onClick={handleClick}
      >
        {active ? "Desativar" : "Ativar"}
      </Button>
      {dialog}
    </>
  );
}
