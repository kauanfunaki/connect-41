"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

type Props = {
  children: React.ReactNode;
};

// Overlay estilo Trello sobre o quadro de Kanban — fecha com ESC, clique fora
// ou botão "X", sempre via router.back() (mantém o histórico e o estado do
// quadro por trás intactos, sem re-renderizar a rota /kanban/[id]).
export function KanbanItemModal({ children }: Props) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:overflow-hidden bg-black/60 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      <div className="relative w-full min-h-full sm:min-h-0 sm:max-w-[94vw] xl:max-w-[1400px] sm:my-4 bg-canvas sm:border sm:border-border sm:rounded-2xl shadow-[var(--c41-shadow-lg)] sm:max-h-[calc(100vh-3rem)] overflow-y-auto">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Fechar"
          className="absolute top-4 right-4 z-10 w-9 h-9 inline-flex items-center justify-center rounded-lg bg-surface-hover border border-border text-fg-secondary hover:text-fg hover:border-border-strong transition-colors"
        >
          <X size={16} />
        </button>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
