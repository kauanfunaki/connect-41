"use client";

import { Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { cancelarLancamentoManual } from "@/app/(app)/lancamentos/actions";

/**
 * Botão de verdade desde a conferência de 30/09 — era texto cinza solto, que o
 * Kauan reprovou nas tabelas do BPO. A confirmação é o diálogo do Connect, não
 * o `confirm()` do navegador: cancelar só se desfaz com um lançamento novo, e o
 * erro da action aparece no próprio diálogo.
 */
export function CancelarLancamento({ entryId }: { entryId: string }) {
  const { dialog, requestConfirm } = useConfirm();

  return (
    <>
      <Button
        variant="danger"
        size="xs"
        onClick={() =>
          requestConfirm(
            {
              title: "Cancelar este lançamento?",
              description: "Ele sai de todos os totais e fica no histórico de auditoria. Para desfazer, só com um lançamento novo.",
              confirmLabel: "Cancelar lançamento",
              destructive: true,
            },
            async () => {
              const r = await cancelarLancamentoManual(entryId);
              if ("error" in r) throw new Error(r.error);
            }
          )
        }
      >
        <Ban size={11} /> Cancelar
      </Button>
      {dialog}
    </>
  );
}
