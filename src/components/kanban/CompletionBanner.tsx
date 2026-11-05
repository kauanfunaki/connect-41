"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";

type Props = {
  canAct: boolean;
  isCompleted: boolean;
  completedByLabel: string | null; // ex: "Concluída em 22/07 por Ana"
  reabrirAction: () => Promise<void>;
};

// Botão explícito de conclusão/reabertura — faz o mesmo que arrastar o card
// pro estágio terminal/inicial, mas com 1 clique e um evento de histórico
// dedicado (COMPLETED/REOPENED), em vez de depender do Kanban.
export function CompletionBanner({ canAct, isCompleted, completedByLabel, reabrirAction }: Props) {
  const [isPending, startTransition] = useTransition();

  if (isCompleted) {
    return (
      <Aviso tom="sucesso" className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 size={16} />
          {completedByLabel ?? "Atividade concluída"}
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

  // Por concluir, o convite mora na linha da Situação ("Marcar como
  // concluída", 05/11/2026) — era um botão solto acima dos campos.
  return null;
}
