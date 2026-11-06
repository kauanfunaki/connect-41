"use client";

// As ações de uma linha da lista: mover para a lixeira (avaliações ativas) ou
// restaurar (na lixeira). Pede confirmação e respeita a revisão que a lista leu.

import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { moverAvaliacaoParaLixeira, restaurarAvaliacao } from "@/app/(app)/planejamento-tributario/actions";

type Props = { id: string; nome: string; revisao: number; naLixeira: boolean };

export function AcoesDaAvaliacao({ id, nome, revisao, naLixeira }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();

  function pedir() {
    requestConfirm(
      naLixeira
        ? { title: `Restaurar “${nome}”?`, description: "A avaliação volta para a lista, com dados e histórico.", confirmLabel: "Restaurar" }
        : {
            title: `Mover “${nome}” para a lixeira?`,
            description: "A avaliação sai da lista, com dados e histórico preservados, e pode ser restaurada na aba Lixeira.",
            confirmLabel: "Mover para a lixeira",
            destructive: true,
          },
      async () => {
        const r = naLixeira ? await restaurarAvaliacao(id, revisao) : await moverAvaliacaoParaLixeira(id, revisao);
        if ("error" in r) return { error: r.error };
        toast.success(naLixeira ? "Avaliação restaurada." : "Avaliação movida para a lixeira.");
        router.refresh();
        return null;
      },
    );
  }

  return (
    <>
      {dialog}
      <Button variant={naLixeira ? "secondary" : "ghost"} size="xs" onClick={pedir}>
        {naLixeira ? <RotateCcw size={14} /> : <Trash2 size={14} />}
        {naLixeira ? "Restaurar" : "Lixeira"}
      </Button>
    </>
  );
}
