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

  // `sm`: fica ao lado do Editar e do Excluir, que são h-8 (30/09).
  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      variant="primary"
      size="sm"
    >
      {isPending ? "Publicando…" : "Publicar"}
   </Button>
  );
}
