"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { emitirCertidaoAction, marcarCertidaoComoVistaAction } from "@/app/(app)/certidoes/actions";
import type { TipoDeCertidao } from "@/lib/certidoes/regras";

/** "Emitir agora": uma consulta à InfoSimples, cobrada, que pode levar alguns minutos. */
export function EmitirCertidao({ companyId, tipo }: { companyId: string; tipo: TipoDeCertidao }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      loading={pendente}
      title="Uma consulta, cobrada pela InfoSimples. Pode levar alguns minutos."
      onClick={() =>
        startTransition(async () => {
          const r = await emitirCertidaoAction(companyId, tipo);
          if (r.ok) toast.success(r.texto);
          else toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <RefreshCw size={12} /> Emitir agora
    </Button>
  );
}

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
      onClick={() =>
        startTransition(async () => {
          const r = await marcarCertidaoComoVistaAction(certidaoId);
          if (!r.ok) toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <Eye size={12} /> Marcar como vista
    </Button>
  );
}
