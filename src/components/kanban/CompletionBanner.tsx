"use client";

import { useTransition } from "react";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";

type Props = {
  canAct: boolean;
  isCompleted: boolean;
  completedByLabel: string | null; // ex: "Concluída em 22/07 por Ana"
  /** `{ error }` quando não reabre — o cartão de uma solicitação encerrada (09/11/2026). */
  reabrirAction: () => Promise<{ error: string } | void>;
};

// Botão explícito de conclusão/reabertura — faz o mesmo que arrastar o card
// pro estágio terminal/inicial, mas com 1 clique e um evento de histórico
// dedicado (COMPLETED/REOPENED), em vez de depender do Kanban.
export function CompletionBanner({ canAct, isCompleted, completedByLabel, reabrirAction }: Props) {
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function reabrir() {
    startTransition(async () => {
      try {
        const r = await reabrirAction();
        if (r && "error" in r) toast.error(r.error);
      } catch {
        toast.error("Não deu para falar com o servidor. A atividade não foi reaberta.");
      }
    });
  }

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
            onClick={reabrir}
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
