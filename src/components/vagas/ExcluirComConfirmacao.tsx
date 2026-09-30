"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  /** Pergunta do diálogo — "Excluir o seu parecer?". */
  titulo: string;
  descricao?: string;
  size?: "xs" | "sm";
};

/**
 * "Excluir" com confirmação, para o parecer da candidatura e o link de teste.
 *
 * Os dois usavam o `DeleteFieldButton` do cadastro de campos personalizados
 * (até 30/09): texto azul sublinhado, e o diálogo perguntava "Excluir o campo
 * 'seu parecer'?" e avisava que "todos os valores preenchidos nele serão
 * perdidos" — frase de campo, não de parecer. Aqui é botão (a regra "botão não
 * é link" da conferência) e cada tela diz o que está excluindo.
 */
export function ExcluirComConfirmacao({ action, titulo, descricao = "Esta ação não pode ser desfeita.", size = "xs" }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  return (
    <>
      <Button
        variant="danger"
        size={size}
        onClick={() => requestConfirm({ title: titulo, description: descricao, destructive: true, confirmLabel: "Excluir" }, action)}
      >
        <Trash2 size={size === "xs" ? 11 : 13} /> Excluir
      </Button>
      {dialog}
    </>
  );
}
