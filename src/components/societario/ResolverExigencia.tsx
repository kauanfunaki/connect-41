"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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
    // Botão de linha como os das outras tabelas do setor ("Abrir", "Editar"):
    // era um link cinza de 12px, a única ação da linha que não parecia botão.
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="xs"
        loading={pendente}
        loadingLabel="Marcando…"
        className="whitespace-nowrap"
        onClick={() => {
          setErro(null);
          startTransition(async () => {
            const r = await resolver(exigenciaId);
            if (r?.error) setErro(r.error);
            else router.refresh();
          });
        }}
      >
        <Check size={12} /> Marcar como cumprida
      </Button>
      {erro && <span role="alert" className="text-[length:var(--fs-micro)] text-danger">{erro}</span>}
    </div>
  );
}
