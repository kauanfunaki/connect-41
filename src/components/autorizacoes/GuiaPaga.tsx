"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { marcarGuiaComoPagaAction } from "@/app/(app)/autorizacoes/guias/actions";

/** "Marcar como paga" / "Desfazer" na lista das guias do mês (28/10/2026). O pagamento é marcado à mão. */
export function GuiaPaga({ guiaId, paga }: { guiaId: string; paga: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();

  return (
    <Button
      variant={paga ? "ghost" : "secondary"}
      size="xs"
      loading={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await marcarGuiaComoPagaAction(guiaId, !paga);
          if (!r.ok) {
            toast.error(r.erro);
            return;
          }
          router.refresh();
        })
      }
    >
      {paga ? (
        <>
          <Undo2 size={12} /> Desfazer pagamento
        </>
      ) : (
        <>
          <Check size={12} /> Marcar como paga
        </>
      )}
    </Button>
  );
}
