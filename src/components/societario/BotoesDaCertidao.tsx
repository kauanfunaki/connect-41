"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { emitirCertidaoAction, marcarCertidaoComoVistaAction } from "@/app/(app)/certidoes/actions";
import { ROTULO_DA_CERTIDAO, type TipoDeCertidao } from "@/lib/certidoes/regras";

/**
 * "Emitir agora": uma consulta à InfoSimples, cobrada, que pode levar alguns
 * minutos. Desde 30/10/2026 (auditoria de UX) pede confirmação com a empresa, a
 * certidão e o custo — eram dezenas de botões iguais na carteira, um clique
 * cada, e o custo só aparecia no `title`, no hover. O nome acessível diz de qual
 * empresa e qual certidão, em vez de "Emitir agora" repetido.
 */
export function EmitirCertidao({ companyId, empresa, tipo }: { companyId: string; empresa: string; tipo: TipoDeCertidao }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const certidao = ROTULO_DA_CERTIDAO[tipo];
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        loading={pendente}
        aria-label={`Emitir agora a certidão ${certidao} de ${empresa}`}
        onClick={() => setConfirmar(true)}
      >
        <RefreshCw size={12} /> Emitir agora
      </Button>
      <ConfirmDialog
        open={confirmar}
        title={`Emitir a certidão ${certidao}?`}
        description={`${empresa}. É uma consulta cobrada pela InfoSimples e pode levar alguns minutos; o resultado aparece nesta tela.`}
        confirmLabel="Emitir"
        onConfirm={() => {
          setConfirmar(false);
          startTransition(async () => {
            const r = await emitirCertidaoAction(companyId, tipo);
            if (r.ok) toast.success(r.texto);
            else toast.error(r.erro);
            router.refresh();
          });
        }}
        onCancel={() => setConfirmar(false)}
      />
    </>
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
