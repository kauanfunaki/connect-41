"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { conferirEntregaTech } from "@/app/(app)/controle-interno/actions";

/**
 * O "Conferir" junto ao PR do item (11/11/2026, funcionalidade-579): pergunta ao
 * GitHub se o PR foi mergeado, ao banco se a migration foi aplicada e ao deploy
 * se o merge está no ar. O que deu certo aparece marcado no "Antes de testar";
 * o aviso diz o que ainda falta.
 */
export function ConferirEntrega({ itemId }: { itemId: string }) {
  const toast = useToast();
  const [conferindo, iniciar] = useTransition();
  return <Button variant="link" size="sm" className="text-ui" disabled={conferindo}
    onClick={() => iniciar(async () => {
      try {
        const r = await conferirEntregaTech(itemId);
        if ("error" in r) toast.error(r.error);
        else if (r.resultados.length && r.resultados.every(x => x.ok)) toast.success(r.resumo);
        else toast.show(r.resumo, "info");
      } catch { toast.error("Não foi possível conferir agora. Atualize a página e tente de novo."); }
    })}>
    <RefreshCw size={12} aria-hidden className={conferindo ? "animate-spin motion-reduce:animate-none" : undefined} />
    {conferindo ? "Conferindo…" : "Conferir"}
  </Button>;
}
