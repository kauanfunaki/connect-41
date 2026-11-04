"use client";

import { useTransition } from "react";
import { PhoneOutgoing } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { registrarCobrancaDoOrgao } from "@/app/(app)/exigencias/actions";

/**
 * O botão da linha em Protocolos parados (04/11/2026): anota que alguém cobrou
 * o órgão agora. Não manda nada a ninguém — o órgão é cobrado por fora (telefone,
 * e-mail, balcão); o Connect guarda quando e quem.
 */
export function RegistrarCobranca({ protocoloId }: { protocoloId: string }) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pendente}
      loadingLabel="Registrando…"
      onClick={() =>
        startTransition(async () => {
          const r = await registrarCobrancaDoOrgao(protocoloId).catch(() => ({ erro: "Não foi possível registrar agora. Tente de novo em instantes." }));
          if ("erro" in r) toast.error(r.erro);
          else toast.success("Cobrança registrada.");
        })
      }
    >
      <PhoneOutgoing size={14} aria-hidden /> Registrar cobrança
    </Button>
  );
}
