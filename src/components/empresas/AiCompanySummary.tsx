"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sparkles } from "lucide-react";
import type { AiSummaryState } from "@/app/(app)/empresas/[id]/ai-actions";

type Props = {
  action: () => Promise<AiSummaryState>;
};

export function AiCompanySummary({ action }: Props) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<AiSummaryState>(null);

  function handleClick() {
    startTransition(async () => {
      setState(await action());
    });
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Resumo IA — últimos 90 dias</h2>
          <p className="text-[12px] text-fg-muted mt-0.5">
            Consolida reuniões, transferências, kanban e documentos num briefing pré-reunião.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          variant="primary" className="font-medium disabled:opacity-60 flex-shrink-0"
        >
          <Sparkles size={14} />
          {isPending ? "Gerando…" : "Gerar Resumo"}
       </Button>
      </div>

      {state && "error" in state && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {state.error}
        </p>
      )}

      {state && "summary" in state && (
        <div className="mt-3 text-[13px] text-fg leading-relaxed whitespace-pre-wrap">{state.summary}</div>
      )}
    </div>
  );
}
