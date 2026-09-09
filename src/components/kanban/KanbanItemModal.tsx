"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDialog } from "@/components/ui/useDialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";

type Props = {
  children: React.ReactNode;
};

// Overlay estilo Trello sobre o quadro de Kanban — fecha com ESC, clique fora
// ou botão "X", sempre via router.back() (mantém o histórico e o estado do
// quadro por trás intactos, sem re-renderizar a rota /kanban/[id]).
export function KanbanItemModal({ children }: Props) {
  const router = useRouter();

  const close = useCallback(() => router.back(), [router]);
  const panelRef = useDialog(true, close);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto sm:overflow-hidden bg-black/60 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      {/* Sem `my-8`: o respiro já vem do `p-8` do container. Com os dois, o
          painel ganhava 32px de padding + 32px de margem em cima (64px, do
          tamanho da topbar) e a altura `100vh-4rem` consumia todo o resto —
          sobrava zero embaixo, e o modal encostava na borda inferior da tela.
          Agora os 4rem descontados são exatamente o padding do container, o
          que deixa 32px em cima e 32px embaixo. */}
      <div ref={panelRef} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Detalhe do item" className="relative w-full min-h-full sm:min-h-0 sm:max-w-[94vw] xl:max-w-[1400px] bg-canvas sm:border sm:border-border sm:rounded-lg shadow-[var(--c41-shadow-lg)] sm:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden">
        <Button
          variant="secondary"
          size="md"
          className="absolute top-4 right-4 z-10 w-9 bg-surface-hover hover:border-border-strong"
          onClick={() => router.back()}
          aria-label="Fechar"
        >
          <X size={16} />
        </Button>
        <div className="p-6 sm:h-full sm:flex sm:flex-col sm:min-h-0">{children}</div>
      </div>
    </div>
  );
}
