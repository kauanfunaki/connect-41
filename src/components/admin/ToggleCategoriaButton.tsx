"use client";

import { Button } from "@/components/ui/Button";
type Props = {
  action: () => Promise<void>;
  ativa: boolean;
};

/**
 * Ativa/desativa uma categoria do plano de contas.
 *
 * Não há botão de excluir nesta tela de propósito: a FK dos lançamentos é
 * `ON DELETE SET NULL`, então apagar desclassificaria os lançamentos antigos.
 */
export function ToggleCategoriaButton({ action, ativa }: Props) {
  return (
    <Button
      variant={ativa ? "secondary" : "success"}
      size="sm"
      onClick={() => action()}
      className="flex-shrink-0"
    >
      {ativa ? "Desativar" : "Reativar"}
    </Button>
  );
}
