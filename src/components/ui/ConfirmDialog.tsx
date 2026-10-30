"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
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
  /** Trava o confirmar — a exclusão que pede o nome digitado (13/10/2026). */
  confirmDisabled?: boolean;
  /** Largura do painel. Padrão `max-w-sm`; a exclusão com a lista do que vai junto pede mais. */
  largura?: string;
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
//
// Vai para o <body> por portal, como o `Modal` (Ajustes 15/10, G2): aberto
// dentro de um bloco com `transform` — o "⋯" de excluir pasta, centralizado
// por translate no cartão —, o `fixed` ficava preso ao bloco e o diálogo
// saía espremido no canto do cartão. No servidor e na hidratação fica no
// lugar; muda no navegador.
const semAssinatura = () => () => {};

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
  confirmDisabled = false,
  largura = "max-w-sm",
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);

  // ESC não cancela enquanto a ação está em voo — a pessoa perderia o retorno
  // (inclusive a mensagem de erro) de algo que já foi disparado no servidor.
  const handleClose = useCallback(() => {
    if (!pending) onCancel();
  }, [pending, onCancel]);
  const panelRef = useDialog(open, handleClose);

  // O foco inicial é o botão de confirmar, não o primeiro controle do painel
  // (que seria "Cancelar") — sobrepõe o padrão do useDialog de propósito: num
  // diálogo de confirmação a ação esperada é o Enter. Menos quando a ação é
  // destrutiva (auditoria de UX, 30/10/2026): aí vale o padrão do useDialog —
  // o primeiro campo, se a confirmação pede um (motivo, nome digitado), ou o
  // Cancelar —, e um Enter apressado não apaga nada.
  useEffect(() => {
    if (open && !destructive) confirmRef.current?.focus();
  }, [open, destructive]);

  if (!open) return null;

  const dialogo = (
    <div
      className="c41-esmaecer fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 text-left"
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
        className={`c41-surgir w-full ${largura} max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-border-strong bg-surface-elevated p-5 shadow-lg`}
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
            disabled={confirmDisabled}
            loading={pending}
            loadingLabel={pendingLabel}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
  return noNavegador ? createPortal(dialogo, document.body) : dialogo;
}
