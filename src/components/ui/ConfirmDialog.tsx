"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { useDialog } from "@/components/ui/useDialog";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

// Diálogo de confirmação temático — substitui o confirm() nativo, que quebra o
// tema, não explica consequências e não mostra erro de retorno da ação.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // ESC não cancela enquanto a ação está em voo — a pessoa perderia o retorno
  // (inclusive a mensagem de erro) de algo que já foi disparado no servidor.
  const handleClose = useCallback(() => {
    if (!pending) onCancel();
  }, [pending, onCancel]);
  const panelRef = useDialog(open, handleClose);

  // O foco inicial aqui é o botão de confirmar, não o primeiro controle do
  // painel (que seria "Cancelar") — sobrepõe o padrão do useDialog de
  // propósito: num diálogo de confirmação a ação esperada é o Enter.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-fg mb-1.5">
          {title}
        </h2>
        {description && <p className="text-[13px] text-fg-secondary mb-3">{description}</p>}

        {error && (
          <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mb-3">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`h-9 px-4 rounded-md text-[13px] font-medium disabled:opacity-60 transition-colors ${
              destructive
                ? "bg-danger text-white hover:bg-danger/90"
                : "bg-brand text-on-brand hover:bg-brand-hover"
            }`}
          >
            {pending ? "Processando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
