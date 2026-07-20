"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import type { AiExtractState } from "@/app/(app)/candidatos/[id]/ai-actions";

type Props = {
  action: () => Promise<AiExtractState>;
};

export function AiResumeExtract({ action }: Props) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<AiExtractState>(null);

  function handleClick() {
    startTransition(async () => {
      setState(await action());
    });
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Triagem de Currículo (IA)</h2>
          <p className="text-[12px] text-fg-muted mt-0.5">
            Lê o PDF do currículo, preenche campos vazios da ficha e gera um resumo profissional.
          </p>
        </div>
        <button
          type="button"
          onClick={handleClick}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          <Sparkles size={14} />
          {isPending ? "Analisando…" : "Analisar Currículo"}
        </button>
      </div>

      {state && "error" in state && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {state.error}
        </p>
      )}

      {state && "summary" in state && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-fg leading-relaxed whitespace-pre-wrap">{state.summary}</p>
          <p className="text-[12px] text-fg-muted">
            {state.filled.length > 0
              ? `Campos preenchidos automaticamente: ${state.filled.join(", ")}.`
              : "Nenhum campo vazio para preencher — a ficha já estava completa."}
          </p>
        </div>
      )}
    </div>
  );
}
