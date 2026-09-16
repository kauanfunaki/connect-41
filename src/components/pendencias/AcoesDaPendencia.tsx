"use client";

import { useState } from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { resolverPendencia, reabrirPendencia, cancelarPendencia } from "@/app/(app)/pendencias/actions";
import { emAndamento, type StatusDaPendencia } from "@/lib/financeiro/pendencias/regras";

/** Resolver, cancelar ou reabrir — os botões que o status atual permite. */
export function AcoesDaPendencia({ id, status }: { id: string; status: StatusDaPendencia }) {
  const { dialog, requestConfirm } = useConfirm();
  const [erro, setErro] = useState<string | null>(null);

  function executar(acao: (id: string) => Promise<{ error: string } | { ok: true }>) {
    return async () => {
      const r = await acao(id);
      // O useConfirm mostra o erro lançado dentro do próprio diálogo.
      if ("error" in r) {
        setErro(r.error);
        throw new Error(r.error);
      }
      setErro(null);
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {emAndamento(status) ? (
        <>
          <Button
            size="sm"
            variant="success"
            onClick={() =>
              requestConfirm(
                { title: "Resolver a pendência?", description: "Ela sai da fila e o cliente não consegue mais responder.", confirmLabel: "Resolver" },
                executar(resolverPendencia)
              )
            }
          >
            <CheckCircle2 size={13} /> Resolver
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              requestConfirm(
                { title: "Cancelar a pendência?", description: "Use quando o pedido não vale mais. Dá para reabrir depois.", confirmLabel: "Cancelar pendência", destructive: true },
                executar(cancelarPendencia)
              )
            }
          >
            <XCircle size={13} /> Cancelar
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            requestConfirm(
              { title: "Reabrir a pendência?", description: "Volta para a fila aguardando o cliente.", confirmLabel: "Reabrir" },
              executar(reabrirPendencia)
            )
          }
        >
          <RotateCcw size={13} /> Reabrir
        </Button>
      )}
      {erro && <span className="text-[12px] text-danger">{erro}</span>}
      {dialog}
    </div>
  );
}
