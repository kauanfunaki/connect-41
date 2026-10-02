"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";

type ActionResult = { error: string } | null | void;

type Props = {
  action: () => Promise<ActionResult>;
  nome: string;
  label?: string;
  description?: string;
  /** Desenho do botão — o mesmo do `Button` (padrão: danger sm). */
  variant?: "danger" | "secondary" | "ghost";
  size?: "xs" | "sm" | "md";
};

// Botão de exclusão com confirmação temática e feedback de erro. Se a action
// retornar { error } (ex: FK — registro com histórico vinculado), mostra no
// diálogo em vez de falhar silenciosamente. Em sucesso, a própria action faz
// redirect. Fonte única — os DeleteButton por-módulo apenas reexportam este.
export function DeleteButton({ action, nome, label = "Excluir", description, variant = "danger", size = "sm" }: Props) {
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
      toast.success(`"${nome}" excluído.`);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </Button>

      <ConfirmDialog
        open={open}
        title={`Excluir "${nome}"?`}
        description={description ?? "Esta ação não pode ser desfeita."}
        confirmLabel="Excluir"
        destructive
        pending={pending}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
