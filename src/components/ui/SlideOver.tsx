"use client";

import { useId, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useDialog } from "@/components/ui/useDialog";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Mostra "← Voltar" no lugar do título fixo — navegação dentro do mesmo painel (ex: lista -> detalhe). */
  onBack?: () => void;
  width?: string; // ex: "max-w-md" — default abaixo
  children: React.ReactNode;
};

// Painel lateral (slide-over) — mesma convenção de Modal.tsx (ESC, clique
// fora, botão X), mas ocupa a borda direita da tela em vez de centralizar.
// Usado quando o conteúdo é navegação dentro do próprio painel (lista <->
// detalhe) em vez de um formulário único — ver Modal.tsx pra esse outro caso.
//
// Vai para o <body> por portal, como o Modal desde 02/10 (07/10/2026): dentro
// de um cartão que sobe no hover ou de qualquer bloco com `transform`, o
// `fixed` ficava preso ao bloco em vez de à tela. No servidor e na hidratação
// fica no lugar — `document` não existe lá.
const semAssinatura = () => () => {};

export function SlideOver({ open, onClose, title, onBack, width = "max-w-md", children }: Props) {
  const panelRef = useDialog(open, onClose);
  const titleId = useId();
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);

  if (!open) return null;

  const painel = (
    <div
      className="c41-esmaecer fixed inset-0 z-50 bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        {...(title ? { "aria-labelledby": titleId } : { "aria-label": "Painel lateral" })}
        className={`fixed inset-y-0 right-0 w-full ${width} bg-surface-elevated border-l border-border-strong shadow-lg flex flex-col slide-over-in`}
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-ui font-medium text-fg-secondary hover:text-fg transition-colors"
            >
              <ArrowLeft size={15} /> Voltar
            </button>
          ) : (
            title && <h2 id={titleId} className="text-dialog-title font-semibold text-fg">{title}</h2>
          )}
          <IconButton onClick={onClose} aria-label="Fechar" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );

  return noNavegador ? createPortal(painel, document.body) : painel;
}
