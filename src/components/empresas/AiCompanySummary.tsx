"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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

  // Cartão e título no padrão dos outros da ficha (30/09): era um bloco
  // montado à mão com título de 14px, logo acima de cartões com 18px.
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">Resumo IA — últimos 90 dias</h2>
          <p className="text-[length:var(--fs-helper)] text-fg-muted mt-0.5">
            Consolida reuniões, transferências, kanban e documentos num briefing pré-reunião.
          </p>
        </div>
        <Button type="button" onClick={handleClick} disabled={isPending} className="flex-shrink-0">
          <Sparkles size={14} />
          {isPending ? "Gerando…" : "Gerar Resumo"}
        </Button>
      </div>

      {state && "error" in state && (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2 mt-4">
          {state.error}
        </p>
      )}

      {state && "summary" in state && (
        <div className="mt-4 text-[length:var(--fs-body)] text-fg leading-relaxed whitespace-pre-wrap">{state.summary}</div>
      )}
    </Card>
  );
}
