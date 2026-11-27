"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { atualizarCadastroDoAcervo } from "@/app/(app)/documentos-fiscais/cadastro/actions";

/** "Atualizar do acervo": lê as notas da empresa no acervo do SPED e cria ou atualiza o cadastro. */
export function AtualizarDoAcervo({ companyId, variante = "primary" }: { companyId: string; variante?: "primary" | "secondary" }) {
  const toast = useToast();
  const router = useRouter();
  const [lendo, iniciar] = useTransition();

  function atualizar() {
    iniciar(async () => {
      const r = await atualizarCadastroDoAcervo(companyId).catch(() => ({ ok: false as const, erro: "Não deu para ler o acervo agora. Tente de novo." }));
      if (!r.ok) return toast.error(r.erro);
      if (r.documentos === 0) toast.show("A empresa não tem nota no acervo do SPED.");
      else
        toast.success(
          `${r.documentos} notas lidas: ${r.produtosNovos} produtos novos e ${r.produtosAtualizados} atualizados; ${r.participantesNovos} fornecedores e clientes novos e ${r.participantesAtualizados} atualizados.`
        );
      router.refresh();
    });
  }

  return (
    <Button variant={variante} onClick={atualizar} loading={lendo} loadingLabel="Lendo o acervo…">
      <RefreshCw size={14} aria-hidden /> Atualizar do acervo
    </Button>
  );
}
