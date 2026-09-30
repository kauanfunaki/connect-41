"use client";

import { Power, PowerOff } from "lucide-react";
import { ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";
import { MenuDeMaisAcoes } from "@/components/admin/AcoesDoItem";

type Props = {
  action: () => Promise<void>;
  active: boolean;
  nome: string;
};

/**
 * Desativar/reativar um plano do catálogo, no "⋯" da linha.
 *
 * Era um botão vermelho "Desativar" fixo em cada plano. Desde o polimento de
 * 30/09, ação rara e que tira algo de circulação vai no menu — a mesma regra
 * das linhas de Cadastros. A confirmação continua a de antes.
 */
export function TogglePlanoButton({ action, active, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = active ? `Desativar o plano "${nome}"?` : `Reativar o plano "${nome}" pra novas assinaturas?`;
    const description = active ? "Ele some das opções pra novas assinaturas, mas assinaturas existentes continuam." : undefined;
    requestConfirm({ title, description, destructive: active, confirmLabel: active ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      <MenuDeMaisAcoes rotulo={`Mais ações do plano ${nome}`}>
        {(fechar) => (
          <ItemDoMenu
            icone={active ? <PowerOff /> : <Power />}
            danger={active}
            onClick={() => {
              fechar();
              handleClick();
            }}
          >
            {active ? "Desativar" : "Ativar"}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </>
  );
}
