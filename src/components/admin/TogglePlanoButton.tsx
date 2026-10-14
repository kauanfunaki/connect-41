"use client";

import { Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  active: boolean;
  nome: string;
};

/**
 * Desativar/reativar um plano do catálogo, no pé do cartão do plano.
 *
 * Esteve no "⋯" da linha desde o polimento de 30/09 (ação rara que tira algo
 * de circulação). Com os cartões (escolha A do Kauan para Planos, 14/10/2026)
 * volta a botão, como no desenho aprovado: "Desativar" discreto ao lado do
 * "Editar" e, no plano inativo, "Ativar". A confirmação continua a de antes.
 */
export function TogglePlanoButton({ action, active, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = active ? `Desativar o plano "${nome}"?` : `Reativar o plano "${nome}" pra novas assinaturas?`;
    const description = active
      ? "Ele some das opções pra novas assinaturas e do site, mas assinaturas existentes continuam."
      : undefined;
    requestConfirm({ title, description, destructive: active, confirmLabel: active ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      <Button variant={active ? "ghost" : "secondary"} size="xs" onClick={handleClick}>
        {active ? <PowerOff size={11} /> : <Power size={11} />}
        {active ? "Desativar" : "Ativar"}
      </Button>
      {dialog}
    </>
  );
}
