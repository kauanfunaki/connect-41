"use client";

import { useState } from "react";

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
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-[12px] text-brand hover:underline disabled:opacity-60"
    >
      {isPending ? "Reenviando…" : "Reenviar"}
    </button>
  );
}
