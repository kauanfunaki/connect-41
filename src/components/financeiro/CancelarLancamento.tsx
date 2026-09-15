"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { cancelarLancamentoManual } from "@/app/(app)/lancamentos/actions";

export function CancelarLancamento({ entryId }: { entryId: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="linkMuted"
        size="xs"
        className="text-[11px]"
        disabled={pendente}
        onClick={() => {
          // Confirmação nativa: cancelar é reversível só por um novo lançamento,
          // e um clique acidental na linha errada não deveria bastar.
          if (!window.confirm("Cancelar este lançamento? Ele sai de todos os totais.")) return;
          setErro(null);
          startTransition(async () => {
            const r = await cancelarLancamentoManual(entryId);
            if ("error" in r) setErro(r.error);
          });
        }}
      >
        Cancelar
      </Button>
      {erro && <span className="text-[11px] text-danger max-w-[220px]">{erro}</span>}
    </div>
  );
}
