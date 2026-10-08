"use client";

import { useConfirm } from "@/components/ui/useConfirm";
import { Switch } from "@/components/ui/Switch";

type Props = {
  action: () => Promise<void>;
  enabled: boolean;
  nome: string;
};

/**
 * Liga/desliga um módulo para o tenant (08/10/2026: interruptor, no lugar do
 * par "Ativar"/"Desativar"). O botão mostrava a ação, e não o estado — "Desativar"
 * vermelho queria dizer "está ligado", e a lista de módulos se lia pelo avesso.
 * O interruptor mostra o estado de relance, como nas obrigações e nas
 * permissões. A confirmação continua: desligar tira o módulo do menu e das rotas.
 */
export function ToggleModuleButton({ action, enabled, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function pedirTroca() {
    const title = enabled ? `Desativar o módulo "${nome}" para este tenant?` : `Ativar o módulo "${nome}" para este tenant?`;
    const description = enabled ? "Ele desaparece do menu e das rotas até ser reativado." : undefined;
    requestConfirm({ title, description, destructive: enabled, confirmLabel: enabled ? "Desativar" : "Ativar" }, action);
  }

  return (
    <>
      {/* Largura fixa: "Ativo" e "Inativo" têm tamanhos diferentes, e o
          select ao lado mudava de posição de uma linha para outra. */}
      <Switch
        checked={enabled}
        onCheckedChange={pedirTroca}
        rotulo={enabled ? "Ativo" : "Inativo"}
        aria-label={`Módulo ativo: ${nome}`}
        className="w-24"
      />
      {dialog}
    </>
  );
}
