"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";

type Props = {
  canAct: boolean;
  isCompleted: boolean;
  completedByLabel: string | null; // ex: "Concluída em 22/07 por Ana"
  concluirAction: () => Promise<void>;
  reabrirAction: () => Promise<void>;
};

// Botão explícito de conclusão/reabertura — faz o mesmo que arrastar o card
// pro estágio terminal/inicial, mas com 1 clique e um evento de histórico
// dedicado (COMPLETED/REOPENED), em vez de depender do Kanban.
export function CompletionBanner({ canAct, isCompleted, completedByLabel, concluirAction, reabrirAction }: Props) {
  const [isPending, startTransition] = useTransition();

  if (isCompleted) {
    return (
      <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 rounded-lg bg-success/10 border border-success/25">
        <div className="flex items-center gap-2 text-[13px] text-success font-medium">
          <CheckCircle2 size={16} />
          {completedByLabel ?? "Tarefa concluída"}
        </div>
        {canAct && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => reabrirAction())}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
          >
            <RotateCcw size={12} /> Reabrir
          </button>
        )}
      </div>
    );
  }

  if (!canAct) return null;

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => concluirAction())}
      className="inline-flex items-center gap-1.5 h-8 px-3 mb-4 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-success hover:border-success/40 hover:bg-success/5 disabled:opacity-60 transition-colors"
    >
      <CheckCircle2 size={14} /> Concluir tarefa
    </button>
  );
}
