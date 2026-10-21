"use client";

import { useTransition } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { apontarAvisosParaOConnect } from "@/app/(app)/admin/integracoes/conexao-actions";

/**
 * "Apontar para o Connect" (21/10): troca, pela API do Chatwoot ou da
 * Evolution, o endereço para onde eles mandam os avisos — o que antes era
 * copiar a URL daqui e colar lá. Rodar de novo não faz mal: se já está certo,
 * só diz isso.
 */
export function ApontarAvisos({ alvo }: { alvo: { tipo: "chatwoot" } | { tipo: "whatsapp"; integrationId: string } }) {
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await apontarAvisosParaOConnect(alvo);
          if ("error" in r) toast.error(r.error);
          else toast.success(r.mensagem);
        })
      }
    >
      <Link2 size={13} /> {pendente ? "Apontando…" : "Apontar os avisos para este endereço"}
    </Button>
  );
}
