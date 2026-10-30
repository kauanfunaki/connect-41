"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { cancelarTarefaDoRobo } from "@/app/(app)/societario/robo/actions";

/** Tira da fila uma tarefa que a máquina ainda não pegou. */
export function CancelarTarefaDoRobo({ id }: { id: string }) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() =>
          requestConfirm(
            { title: "Tirar esta tarefa da fila?", description: "O robô não vai executá-la. Dá para pedir de novo pela licença.", confirmLabel: "Tirar da fila" },
            async () => {
              const r = await cancelarTarefaDoRobo(id);
              if ("error" in r) throw new Error(r.error);
            }
          )
        }
      >
        <X size={12} /> Cancelar
      </Button>
      {dialog}
    </>
  );
}
