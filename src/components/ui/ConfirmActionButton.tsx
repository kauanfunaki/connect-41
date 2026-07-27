"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

type ActionResult = { error: string } | null | void;

type Props = {
  action: () => Promise<ActionResult>;
  /** Texto do botão que abre o diálogo. */
  label: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Mensagem de sucesso no toast. Omitir não mostra toast. */
  successMessage?: string;
  destructive?: boolean;
  className?: string;
};

// Mesmo contrato do DeleteButton, mas para ações que não são exclusão
// (encerrar/reabrir vaga, etc.) — o DeleteButton hardcoda título "Excluir X?"
// e estilo destrutivo, então não servia para confirmar uma ação reversível.
export function ConfirmActionButton({
  action,
  label,
  title,
  description,
  confirmLabel,
  successMessage,
  destructive = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      if (successMessage) toast.success(successMessage);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className={
          className ??
          "h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
        }
      >
        {label}
      </button>

      <ConfirmDialog
        open={open}
        title={title}
        description={description}
        confirmLabel={confirmLabel ?? label}
        destructive={destructive}
        pending={pending}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
