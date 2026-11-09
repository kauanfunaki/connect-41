"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { pararDeTrabalharNaEmpresa, trabalharNaEmpresa } from "@/app/(app)/foco-actions";

/**
 * O botão do aviso de um link de outra empresa (05/11/2026): a empresa só se
 * escolhe na faixa, então o link não troca sozinho — o botão troca. Com
 * `companyId`, passa a trabalhar nela; sem (o link pedia "todas"), sai do foco.
 * O endereço fica o mesmo, e a tela é desenhada de novo.
 */
export function AbrirOQueOLinkPedia({ companyId, rotulo }: { companyId: string | null; rotulo: string }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      size="xs"
      loading={pendente}
      loadingLabel="Abrindo…"
      onClick={() =>
        iniciar(async () => {
          if (!companyId) {
            await pararDeTrabalharNaEmpresa();
            return;
          }
          const r = await trabalharNaEmpresa(companyId);
          if (!r.ok) return toast.error(r.erro);
          router.refresh();
        })
      }
    >
      {rotulo}
    </Button>
  );
}
