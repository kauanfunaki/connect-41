"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
};

export function ResendRecipientButton({ action }: Props) {
  const [isPending, setIsPending] = useState(false);

  async function handleClick() {
    setIsPending(true);
    try {
      await action();
    } finally {
      setIsPending(false);
    }
  }

  return (
    // Era link de texto (30/09): ação é botão.
    <Button variant="secondary" size="xs" className="flex-shrink-0" onClick={handleClick} disabled={isPending}>
      <RotateCw size={11} />
      {isPending ? "Reenviando…" : "Reenviar"}
    </Button>
  );
}
