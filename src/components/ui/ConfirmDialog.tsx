"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { useDialog } from "@/components/ui/useDialog";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** O que o botão de confirmar diz enquanto a ação roda. Padrão: "Processando…". */
  pendingLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
  /** Campo extra antes dos botões (ex: motivo da reprovação no funil). */
  children?: React.ReactNode;
};

// Diálogo de confirmação temático — substitui o confirm() nativo, que quebra o
// tema, não explica consequências e não mostra erro de retorno da ação.
//
// Os dois botões são o `Button` desde 07/10/2026. Eram escritos à mão, e o
// "Cancelar" saía com borda fraca e texto cinza (o `secondary` do sistema tem
// borda forte e texto normal), o confirmar em peso médio e o destrutivo em
// branco sobre o vermelho do tema, que no escuro dava 3,17:1. O destrutivo
// segue cheio (`dangerSolid`, tom fixo de 4,99:1): cheio ou contorno, como o
// `Button danger`, fica para o Kauan decidir.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  pendingLabel = "Processando…",
  destructive = false,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
  children,
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
      className="c41-esmaecer fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
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
        className="c41-surgir w-full max-w-sm rounded-lg border border-border-strong bg-surface-elevated p-5 shadow-lg"
      >
        <h2 id={titleId} className="text-dialog-title font-semibold text-fg mb-1.5">
          {title}
        </h2>
        {description && <p className="text-ui text-fg-secondary mb-3">{description}</p>}

        {children && <div className="mb-3">{children}</div>}

        {error && <Aviso className="mb-3">{error}</Aviso>}

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "dangerSolid" : "primary"}
            onClick={onConfirm}
            loading={pending}
            loadingLabel={pendingLabel}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
