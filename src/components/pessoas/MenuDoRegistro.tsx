"use client";

import { MoreHorizontal, Trash2 } from "lucide-react";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  /** Pergunta do diálogo de confirmação, na voz da tela ("Remover este exame?"). */
  titulo: string;
  descricao?: string;
  /** "Remover" nos registros da ficha; "Excluir" na turma, que leva os participantes junto. */
  rotulo?: string;
  onRemover: () => Promise<void>;
};

/**
 * O "⋯" dos registros de DP — afastamento, férias, exame, escala, turma.
 *
 * Até 30/09 o "Remover" era um botão vermelho ao lado do "Atualizar", no mesmo
 * tamanho: o clique errado apagava o registro em vez de salvar a situação. A
 * regra da conferência ("ação rara e destrutiva vai no menu") é a mesma das
 * linhas de Cadastros (`AcoesDeLinha`) e das licenças (`AcoesDaLicenca`); a
 * confirmação continua sendo o `useConfirm`.
 */
export function MenuDoRegistro({ titulo, descricao, rotulo = "Remover", onRemover }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  return (
    <>
      <Popover
        align="right"
        width={180}
        aria-label="Mais ações"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label="Mais ações"
            aria-expanded={open}
            className={`h-7 w-7 rounded-md border inline-flex items-center justify-center transition-colors ${
              open ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
      >
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              requestConfirm({ title: titulo, description: descricao, destructive: true, confirmLabel: rotulo }, onRemover);
            }}
          >
            {rotulo}
          </ItemDoMenu>
        )}
      </Popover>
      {dialog}
    </>
  );
}
