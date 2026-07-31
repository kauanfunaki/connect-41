"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  action: () => Promise<void>;
};

export function PublishDocumentButton({ action }: Props) {
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
      type="button"
      onClick={handleClick}
      disabled={isPending}
      variant="primary" className="font-medium disabled:opacity-60"
    >
      {isPending ? "Publicando…" : "Publicar"}
   </Button>
  );
}
