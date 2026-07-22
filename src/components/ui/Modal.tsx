"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: string; // ex: "max-w-lg" — default abaixo
  children: React.ReactNode;
};

// Modal genérico controlado (não depende de rota) — fecha com ESC, clique
// fora, ou botão "X". Usado por fluxos de criação rápida (Nova lista, Novo
// espaço/pasta) e reaproveitável por outros modais futuros do app.
export function Modal({ open, onClose, title, maxWidth = "max-w-md", children }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`relative w-full ${maxWidth} bg-surface-elevated border border-border-strong rounded-2xl shadow-[var(--c41-shadow-lg)] max-h-[calc(100vh-2rem)] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          {title && <h2 className="text-[15px] font-semibold text-fg">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}
