"use client";

import { useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useDialog } from "@/components/ui/useDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: string; // ex: "max-w-lg" — default abaixo
  /** Fundo desfocado em vez de só escurecido — para janelas de navegação, como a troca de setor. */
  desfocar?: boolean;
  children: React.ReactNode;
};

// Modal genérico controlado (não depende de rota) — fecha com ESC, clique
// fora, ou botão "X". Usado por fluxos de criação rápida (Nova lista, Novo
// espaço/pasta) e reaproveitável por outros modais futuros do app.
//
// Vai para o <body> por portal (02/10/2026): aberto dentro de uma célula de
// tabela ou de um bloco com `overflow`/`transform`, herdava alinhamento e
// podia ser cortado ou preso no contexto de empilhamento do pai. No servidor e
// na hidratação fica no lugar — `document` não existe lá — e muda no navegador.
const semAssinatura = () => () => {};

export function Modal({ open, onClose, title, maxWidth = "max-w-md", desfocar = false, children }: Props) {
  const panelRef = useDialog(open, onClose);
  const titleId = useId();
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);

  if (!open) return null;

  const modal = (
    <div
      className={`c41-esmaecer fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 ${desfocar ? "bg-black/40 backdrop-blur-sm" : "bg-black/60"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...(title ? { "aria-labelledby": titleId } : { "aria-label": "Diálogo" })}
        className={`c41-surgir relative w-full ${maxWidth} text-left bg-surface-elevated border border-border-strong rounded-lg shadow-lg max-h-[calc(100dvh-2rem)] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          {title && <h2 id={titleId} className="text-dialog-title font-semibold text-fg">{title}</h2>}
          <IconButton onClick={onClose} aria-label="Fechar" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
  return noNavegador ? createPortal(modal, document.body) : modal;
}
