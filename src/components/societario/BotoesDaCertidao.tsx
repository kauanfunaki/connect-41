"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { marcarCertidaoComoVistaAction } from "@/app/(app)/certidoes/actions";

// "Emitir agora" saiu daqui em 05/11/2026: a emissão, com a confirmação de
// empresa, certidões e preço, mora no "Emitir ▾" da linha e no painel da
// empresa (`ListaDasCertidoes`).

/** A positiva que alguém do setor já viu. */
export function MarcarCertidaoComoVista({ certidaoId }: { certidaoId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="xs"
      loading={pendente}
      loadingLabel="Marcando…"
      onClick={() =>
        startTransition(async () => {
          const r = await marcarCertidaoComoVistaAction(certidaoId);
          if (!r.ok) toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <Eye size={12} aria-hidden /> Marcar como vista
    </Button>
  );
}
