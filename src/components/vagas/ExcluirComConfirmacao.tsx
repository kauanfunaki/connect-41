"use client";

import { Trash2 } from "lucide-react";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  /** Pergunta do diálogo — "Excluir o seu parecer?". */
  titulo: string;
  descricao?: string;
  /** `xs` ao lado de botão `xs` (o "⋯" de 28px); `sm` ao lado de botão `sm` (32px). */
  size?: "xs" | "sm";
};

/**
 * "Excluir" com confirmação, para o parecer da candidatura.
 *
 * Usava o `DeleteFieldButton` do cadastro de campos personalizados (até 30/09):
 * texto azul sublinhado, e o diálogo perguntava "Excluir o campo 'seu
 * parecer'?". Virou botão vermelho à vista e, desde 15/10/2026, vai no "⋯" —
 * a ação que apaga fica no menu mesmo sendo a única (D3). Cada tela diz o que
 * está excluindo.
 */
export function ExcluirComConfirmacao({ action, titulo, descricao = "Esta ação não pode ser desfeita.", size = "xs" }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <MenuDeMaisAcoes size={size === "xs" ? "sm" : "md"} align="right" width={180}>
        {({ close }) => (
          <ItemDoMenu
            icone={<Trash2 />}
            danger
            onClick={() => {
              close();
              requestConfirm({ title: titulo, description: descricao, destructive: true, confirmLabel: "Excluir" }, action);
            }}
          >
            Excluir
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </>
  );
}
