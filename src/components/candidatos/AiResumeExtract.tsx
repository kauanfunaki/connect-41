"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Sparkles } from "lucide-react";
import type { AiExtractState } from "@/app/(app)/candidatos/[id]/ai-actions";
import { Aviso } from "@/components/ui/Aviso";

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
    <Card className="p-5">
      {/* `flex-wrap`: no celular o texto ficava espremido numa coluna estreita
          ao lado do botão; agora o botão desce para a linha de baixo. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-section font-semibold text-fg">Triagem de currículo (IA)</h2>
          <p className="text-fs-2 text-fg-muted mt-0.5">
            Lê o PDF do currículo, preenche campos vazios da ficha e gera um resumo profissional.
          </p>
        </div>
        <Button type="button" onClick={handleClick} disabled={isPending} className="flex-shrink-0">
          <Sparkles size={14} />
          {isPending ? "Analisando…" : "Analisar currículo"}
        </Button>
      </div>

      {state && "error" in state && (
        <Aviso className="mt-3">
          {state.error}
        </Aviso>
      )}

      {state && "summary" in state && (
        <div className="mt-3 space-y-2">
          <p className="text-ui text-fg leading-relaxed whitespace-pre-wrap">{state.summary}</p>
          <p className="text-fs-2 text-fg-muted">
            {state.filled.length > 0
              ? `Campos preenchidos automaticamente: ${state.filled.join(", ")}.`
              : "Nenhum campo vazio para preencher — a ficha já estava completa."}
          </p>
        </div>
      )}
    </Card>
  );
}
