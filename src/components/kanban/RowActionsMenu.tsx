"use client";

import { Trash2 } from "lucide-react";

import { useConfirm } from "@/components/ui/useConfirm";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";

type Props = {
  name: string;
  /** Quantas subatividades, de todos os níveis, vão junto — a confirmação diz o número. */
  subatividades?: number;
  onDelete: () => Promise<void>;
};

/**
 * O "vai junto" da confirmação de excluir (06/11/2026): com subatividade em
 * vários níveis, "Subatividades vão junto" escondia quanto se apagava — a
 * cascata do banco leva a árvore inteira, com o histórico de cada uma.
 *
 * Os anexos saíram da frase: o documento da atividade é ligado por
 * `entityType`/`entityId`, sem chave no banco, e não é apagado com ela.
 */
export function oQueVaiJunto(subatividades: number): string {
  if (subatividades === 0) return "Os comentários e o histórico vão junto. Esta ação não pode ser desfeita.";
  const quantas = subatividades === 1 ? "A subatividade dentro dela vai junto" : `As ${subatividades} subatividades dentro dela, de todos os níveis, vão junto`;
  return `${quantas}, com os comentários e o histórico. Esta ação não pode ser desfeita.`;
}

// Menu "…" da linha de tarefa na visão de lista. Até aqui excluir uma tarefa
// exigia abrir o detalhe dela — o que, numa lista de dezenas de itens criados
// pelo "Adicionar atividade", significava um round-trip por exclusão.
//
// Desde 15/10/2026 é o "⋯" de verdade (`MenuDeMaisAcoes`): era um botão
// vermelho "Excluir" à vista em toda linha, e excluir fica no menu mesmo sendo
// a única ação (D3).
//
// Irmão do <Link> do título, não filho: o clique não pode navegar. A linha é
// `draggable`, então o gatilho também para a propagação — sem isso, mirar no
// menu com o mouse já iniciava um arrasto da linha.
export function RowActionsMenu({ name, subatividades = 0, onDelete }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  return (
    <span
      className="flex-shrink-0"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <MenuDeMaisAcoes rotulo={`Mais ações de ${name}`} align="right" width={180}>
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              requestConfirm(
                {
                  title: `Excluir "${name}"?`,
                  description: oQueVaiJunto(subatividades),
                  destructive: true,
                  confirmLabel: "Excluir",
                },
                onDelete
              );
            }}
          >
            Excluir
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </span>
  );
}
