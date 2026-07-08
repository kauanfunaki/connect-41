"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import type { HandoffActionResult } from "@/app/(app)/transferencias/actions";

type Props = {
  aceitarAction: () => Promise<HandoffActionResult>;
  rejeitarAction: () => Promise<HandoffActionResult>;
};

type Mode = "aceitar" | "rejeitar" | null;

// Aceitar/rejeitar com confirmação temática e feedback de erro — mesmo padrão
// do DeleteButton (fonte única em ui/), em vez do confirm() nativo anterior,
// que não mostrava erro quando a transferência já tinha sido resolvida.
export function HandoffActions({ aceitarAction, rejeitarAction }: Props) {
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleConfirm() {
    setError(null);
    const action = mode === "aceitar" ? aceitarAction : rejeitarAction;
    startTransition(async () => {
      const result = await action();
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      toast.success(mode === "aceitar" ? "Transferência aceita." : "Transferência rejeitada.");
      setMode(null);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode("aceitar");
          }}
          className="h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors"
        >
          Aceitar
        </button>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode("rejeitar");
          }}
          className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
        >
          Rejeitar
        </button>
      </div>

      <ConfirmDialog
        open={mode !== null}
        title={mode === "aceitar" ? "Aceitar esta transferência?" : "Rejeitar esta transferência?"}
        description={
          mode === "aceitar"
            ? "A entidade passa a ser acompanhada pelo setor de destino."
            : "Quem solicitou será avisado da rejeição."
        }
        confirmLabel={mode === "aceitar" ? "Aceitar" : "Rejeitar"}
        destructive={mode === "rejeitar"}
        pending={pending}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setMode(null)}
      />
    </>
  );
}
