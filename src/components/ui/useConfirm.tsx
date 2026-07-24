"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
};

// Substitui o padrão `if (confirm(msg)) await action()` (confirm() nativo
// quebra o tema e não mostra erro de retorno) por um ConfirmDialog temático,
// sem duplicar state de open/pending em cada callsite que precisa disso.
//
// Uso:
//   const { dialog, requestConfirm } = useConfirm();
//   <button onClick={() => requestConfirm({ title: "Remover X?", destructive: true }, action)} />
//   {dialog}
export function useConfirm() {
  const [pendingConfirm, setPendingConfirm] = useState<{ options: ConfirmOptions; action: () => Promise<void> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestConfirm(options: ConfirmOptions, action: () => Promise<void>) {
    setError(null);
    setPendingConfirm({ options, action });
  }

  function handleConfirm() {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    startTransition(async () => {
      try {
        await action();
        setPendingConfirm(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao processar. Tente novamente.");
      }
    });
  }

  const dialog = (
    <ConfirmDialog
      open={pendingConfirm !== null}
      title={pendingConfirm?.options.title ?? ""}
      description={pendingConfirm?.options.description}
      confirmLabel={pendingConfirm?.options.confirmLabel}
      destructive={pendingConfirm?.options.destructive}
      pending={isPending}
      error={error}
      onConfirm={handleConfirm}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  return { dialog, requestConfirm };
}
