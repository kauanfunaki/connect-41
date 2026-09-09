"use client";

import { useConfirm } from "@/components/ui/useConfirm";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
};

export function DisconnectButton({ action }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    requestConfirm(
      {
        title: "Desconectar esta conta?",
        description: "Reuniões já agendadas continuam existindo, mas você não conseguirá criar novas até reconectar.",
        confirmLabel: "Desconectar",
      },
      action
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        className="flex-shrink-0"
        onClick={handleClick}
      >
        Desconectar
      </Button>
      {dialog}
    </>
  );
}
