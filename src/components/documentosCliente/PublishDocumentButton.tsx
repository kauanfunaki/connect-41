"use client";

import { useState } from "react";

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
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
    >
      {isPending ? "Publicando…" : "Publicar"}
    </button>
  );
}
