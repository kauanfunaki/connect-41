"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { excluirLead } from "@/app/(app)/leads/actions";

/** Apagar o lead a pedido da pessoa (LGPD) — com confirmação, porque não volta. */
export function ExcluirLead({ id }: { id: string }) {
  const router = useRouter();
  const { dialog, requestConfirm } = useConfirm();

  return (
    <>
      <Button
        size="sm"
        variant="danger"
        onClick={() =>
          requestConfirm(
            {
              title: "Excluir este lead?",
              description:
                "Use quando a pessoa pedir para apagar os dados dela. O lead e os avisos do sino sobre ele somem de vez; para só tirar da fila, mude a situação para Descartado.",
              confirmLabel: "Excluir de vez",
              destructive: true,
            },
            async () => {
              const r = await excluirLead(id);
              // O useConfirm mostra o erro lançado dentro do próprio diálogo.
              if ("error" in r) throw new Error(r.error);
              router.push("/leads");
            }
          )
        }
      >
        <Trash2 size={13} /> Excluir
      </Button>
      {dialog}
    </>
  );
}
