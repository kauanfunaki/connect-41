"use client";

import { Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/useConfirm";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";

type Props = {
  /** Como o item se chama no texto do diálogo: "espaço", "pasta", "lista". */
  kind: string;
  name: string;
  action: () => Promise<PipelineState>;
};

// Menu "…" de excluir para Espaço / Pasta / Lista. Nos três casos o card
// inteiro é um <Link>, então este menu é renderizado como IRMÃO dele, posicionado
// por cima — nunca dentro. Um <button> dentro de um <a> é HTML inválido e, na
// prática, o clique no menu também navegaria.
//
// Desde 15/10/2026 é o "⋯" de verdade (`MenuDeMaisAcoes`): desenhava um botão
// vermelho "Excluir" à vista em cada cartão e linha, e excluir fica no menu
// mesmo sendo a única ação (D3).
//
// A action devolve { error } em vez de lançar: erro lançado em server action é
// mascarado pelo Next em produção ("An error occurred in the Server Components
// render"), e a mensagem aqui é justamente o que explica por que não deu
// ("Esvazie o espaço antes…"). O throw acontece no cliente, onde o useConfirm
// consegue mostrar o texto real.
export function DeleteEntityMenu({ kind, name, action }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleDelete() {
    requestConfirm(
      {
        title: `Excluir ${kind} "${name}"?`,
        description: "Esta ação não pode ser desfeita.",
        destructive: true,
        confirmLabel: "Excluir",
      },
      async () => {
        const res = await action();
        if (res?.error) throw new Error(res.error);
      }
    );
  }

  return (
    <>
      <MenuDeMaisAcoes rotulo={`Mais ações de ${name}`} align="right" width={180}>
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              handleDelete();
            }}
          >
            Excluir {kind}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </>
  );
}
