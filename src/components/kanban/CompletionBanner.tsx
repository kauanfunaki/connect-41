"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

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
      <Aviso tom="sucesso" className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 size={16} />
          {completedByLabel ?? "Tarefa concluída"}
        </div>
        {canAct && (
          <Button
            variant="secondary"
            size="xs"
            disabled={isPending}
            onClick={() => startTransition(() => reabrirAction())}
          >
            <RotateCcw size={12} /> Reabrir
          </Button>
        )}
      </Aviso>
    );
  }

  if (!canAct) return null;

  return (
    // Neutro em repouso e verde só no hover — não é o `success` do design
    // system, que é verde o tempo todo. O convite a concluir não deve competir
    // com o conteúdo da tarefa antes de o mouse chegar nele.
    <Button
      variant="secondary"
      size="sm"
      className="mb-4 hover:text-success hover:border-success/40 hover:bg-success/5"
      disabled={isPending}
      onClick={() => startTransition(() => concluirAction())}
    >
      <CheckCircle2 size={14} /> Concluir tarefa
    </Button>
  );
}
