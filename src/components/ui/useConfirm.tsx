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
//
// A ação pode devolver `{ error }` (30/10/2026): a janela fica aberta e mostra o
// motivo. Antes só exceção virava erro, e a Server Action que recusava com um
// `return` vazio (sem permissão, setor inativo) fechava a janela como se
// tivesse feito.
type ConfirmAction = () => Promise<{ error: string } | null | void>;

export function useConfirm() {
  const [pendingConfirm, setPendingConfirm] = useState<{ options: ConfirmOptions; action: ConfirmAction } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestConfirm(options: ConfirmOptions, action: ConfirmAction) {
    setError(null);
    setPendingConfirm({ options, action });
  }

  function handleConfirm() {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    startTransition(async () => {
      try {
        const result = await action();
        if (result && "error" in result) {
          setError(result.error);
          return;
        }
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
