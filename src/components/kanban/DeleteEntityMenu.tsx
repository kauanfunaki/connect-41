"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/useConfirm";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ExclusaoConfirmada } from "@/components/ui/ExclusaoConfirmada";
import type { ConfirmacaoDaTarefa } from "@/lib/kanban/exclusaoDeTarefa";

type Props = {
  /** Como o item se chama no texto do diálogo: "espaço", "pasta", "tarefa". */
  kind: string;
  name: string;
  /** Recebe o nome digitado quando a exclusão é em massa (`emMassa`). */
  action: (confirmacao?: string) => Promise<PipelineState>;
  /**
   * Exclusão em massa — a tarefa com as atividades dentro (10/11/2026): a
   * janela diz o que vai junto e o botão só acende com o nome digitado, que a
   * action confere de novo. Sem isso, a confirmação simples de sempre.
   */
  emMassa?: ConfirmacaoDaTarefa | null;
};

// Menu "…" de excluir para Espaço / Pasta / Tarefa. Nos três casos o card
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
export function DeleteEntityMenu({ kind, name, action, emMassa }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  const [forteAberta, setForteAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, startExcluir] = useTransition();

  function handleDelete() {
    if (emMassa) {
      setErro(null);
      setForteAberta(true);
      return;
    }
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

  function excluirEmMassa(digitado: string) {
    startExcluir(async () => {
      const res = await action(digitado).catch((): PipelineState => ({ error: "Não foi possível excluir. Tente de novo." }));
      if (res?.error) {
        setErro(res.error);
        return;
      }
      setForteAberta(false);
    });
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
      {emMassa && forteAberta && (
        <ExclusaoConfirmada
          titulo={emMassa.titulo}
          descricao={emMassa.descricao}
          nome={name}
          rotuloDoBotao={emMassa.rotuloDoBotao}
          pending={excluindo}
          erro={erro}
          onConfirm={excluirEmMassa}
          onCancel={() => {
            if (!excluindo) setForteAberta(false);
          }}
        />
      )}
    </>
  );
}
