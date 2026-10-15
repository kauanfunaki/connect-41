"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/Switch";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  hasAccess: boolean;
  /** Nome do Super Admin, para a confirmação e o leitor de tela. */
  nome: string;
};

/**
 * O acesso de um Super Admin de outro workspace (15/10/2026: interruptor, no
 * lugar do par "Conceder acesso" verde / "Revogar acesso" vermelho). Mostra o
 * estado de relance, como os módulos. Revogar pergunta antes — era um clique
 * só; conceder não tira nada de ninguém e segue direto.
 */
export function ToggleAccessButton({ action, hasAccess, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  const [pendente, startTransition] = useTransition();

  function pedirTroca() {
    if (!hasAccess) {
      startTransition(() => action());
      return;
    }
    requestConfirm(
      {
        title: `Revogar o acesso de ${nome}?`,
        description: "Deixa de ver este workspace. Dá para conceder de novo depois.",
        confirmLabel: "Revogar acesso",
        destructive: true,
      },
      action
    );
  }

  return (
    <>
      {/* Largura fixa: "Com acesso" e "Sem acesso" não empurram a linha ao trocar. */}
      <Switch
        checked={hasAccess}
        disabled={pendente}
        onCheckedChange={pedirTroca}
        rotulo={hasAccess ? "Com acesso" : "Sem acesso"}
        aria-label={`Acesso de ${nome} a este workspace`}
        className="w-32 flex-shrink-0"
      />
      {dialog}
    </>
  );
}
