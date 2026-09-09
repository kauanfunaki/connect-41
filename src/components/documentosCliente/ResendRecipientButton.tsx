"use client";

import { useState } from "react";
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
    <Button
      variant="link"
      className="text-[12px] disabled:opacity-60"
      onClick={handleClick}
      disabled={isPending}
    >
      {isPending ? "Reenviando…" : "Reenviar"}
    </Button>
  );
}
