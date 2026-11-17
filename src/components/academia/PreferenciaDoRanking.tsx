"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/Switch";
import { AjudaDoCampo } from "@/components/ui/CampoForm";
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

  // A frase embaixo do interruptor virou o "?" ao lado dele (17/11/2026, melhoria-707).
  return (
    <span className="inline-flex items-center gap-1.5">
      <Switch checked={aparece} onCheckedChange={trocar} disabled={gravando} rotulo="Aparecer no ranking" />
      <AjudaDoCampo
        texto="Desligado, você some da lista dos colegas e do post do ranking, e vê só os seus números."
        rotulo="Aparecer no ranking"
      />
    </span>
  );
}
