"use client";

import { useState, useTransition } from "react";
import { Lock, Trash2 } from "lucide-react";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  nome: string;
  /** Só com o ciclo aberto. */
  encerrar?: () => Promise<void>;
  /** Só o administrador (13/10/2026). */
  excluir?: () => Promise<void>;
};

/**
 * Encerrar e excluir o ciclo, no "⋯" do cabeçalho, em vermelho e com
 * confirmação (15/10/2026). "Encerrar ciclo" fechava de vez num clique, sem
 * perguntar, e o "Excluir" ficava à vista ao lado dele.
 *
 * A exclusão não passa pelo `useConfirm`: a action volta para a lista com
 * `redirect`, que chega aqui como erro — o `useConfirm` o mostraria no diálogo.
 * É o mesmo caminho do `DeleteButton`.
 */
export function AcoesDoCiclo({ nome, encerrar, excluir }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  const [excluindo, setExcluindo] = useState(false);
  const [pendente, startTransition] = useTransition();

  return (
    <>
      <MenuDeMaisAcoes rotulo="Mais ações do ciclo" size="md" align="right" width={200}>
        {({ close }) => (
          <>
            {encerrar && (
              <ItemDoMenu
                icone={<Lock />}
                danger
                onClick={() => {
                  close();
                  requestConfirm(
                    {
                      title: `Encerrar o ciclo "${nome}"?`,
                      description: "Ninguém mais registra avaliação nele, e o ciclo não reabre.",
                      confirmLabel: "Encerrar ciclo",
                      destructive: true,
                    },
                    encerrar
                  );
                }}
              >
                Encerrar ciclo
              </ItemDoMenu>
            )}
            {excluir && (
              <ItemDoMenu
                icone={<Trash2 />}
                danger
                onClick={() => {
                  close();
                  setExcluindo(true);
                }}
              >
                Excluir ciclo
              </ItemDoMenu>
            )}
          </>
        )}
      </MenuDeMaisAcoes>
      {dialog}
      {excluir && (
        <ConfirmDialog
          open={excluindo}
          title={`Excluir "${nome}"?`}
          description="As avaliações do ciclo saem junto. Esta ação não pode ser desfeita."
          confirmLabel="Excluir"
          destructive
          pending={pendente}
          onConfirm={() => startTransition(() => excluir())}
          onCancel={() => setExcluindo(false)}
        />
      )}
    </>
  );
}
