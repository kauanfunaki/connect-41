"use client";

import { useId } from "react";
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
export function SlideOver({ open, onClose, title, onBack, width = "max-w-md", children }: Props) {
  const panelRef = useDialog(open, onClose);
  const titleId = useId();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60"
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
        className={`fixed inset-y-0 right-0 w-full ${width} bg-surface-elevated border-l border-border-strong shadow-[var(--c41-shadow-lg)] flex flex-col slide-over-in`}
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-secondary hover:text-fg transition-colors"
            >
              <ArrowLeft size={15} /> Voltar
            </button>
          ) : (
            title && <h2 id={titleId} className="text-[15px] font-semibold text-fg">{title}</h2>
          )}
          <IconButton onClick={onClose} aria-label="Fechar" className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
