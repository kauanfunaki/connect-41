"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { ProcessoState } from "@/app/(app)/processos/actions";

/**
 * "Marcar como cumprida" fora do detalhe do processo.
 *
 * Usa a mesma action do roteiro (`resolverExigencia`), que revalida só as rotas
 * de `/processos` — por isso o `router.refresh()`: sem ele, a lista de
 * exigências continuaria mostrando aberta a exigência que acabou de ser
 * resolvida.
 */
export function ResolverExigencia({
  exigenciaId,
  resolver,
}: {
  exigenciaId: string;
  resolver: (requirementId: string) => Promise<ProcessoState>;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="linkMuted"
        size="xs"
        disabled={pendente}
        className="text-[12px] whitespace-nowrap"
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await resolver(exigenciaId);
            if (r?.error) setErro(r.error);
            else router.refresh();
          });
        }}
      >
        {pendente ? "Salvando…" : "Marcar como cumprida"}
      </Button>
      {erro && <span className="text-[11px] text-danger">{erro}</span>}
    </div>
  );
}
