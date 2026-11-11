"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { gravarPreferenciaAction } from "@/app/(app)/academia/actions";

/**
 * "Aparecer no ranking" (10/11/2026, pedido do Kauan): ligado por padrão.
 * Desligado, a pessoa some da tela dos colegas e da API do post do Slack, e
 * em troca vê só os próprios números.
 */
export function PreferenciaDoRanking({ aparece: inicial }: { aparece: boolean }) {
  const [aparece, setAparece] = useState(inicial);
  const [gravando, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function trocar(ligado: boolean) {
    setAparece(ligado);
    iniciar(async () => {
      const r = await gravarPreferenciaAction(ligado);
      if ("erro" in r) {
        setAparece(!ligado);
        toast.error(r.erro);
        return;
      }
      toast.success(ligado ? "Você voltou ao ranking." : "Você saiu do ranking. Seus números ficam só para você.");
      router.refresh();
    });
  }

  return (
    <Switch
      checked={aparece}
      onCheckedChange={trocar}
      disabled={gravando}
      rotulo="Aparecer no ranking"
      aria-describedby="preferencia-do-ranking-ajuda"
    />
  );
}
