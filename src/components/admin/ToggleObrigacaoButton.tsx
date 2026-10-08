"use client";

import { useConfirm } from "@/components/ui/useConfirm";
import { Switch } from "@/components/ui/Switch";

type Props = {
  action: () => Promise<void>;
  ativo: boolean;
  nome: string;
};

export function ToggleObrigacaoButton({ action, ativo, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  // Controlado: o interruptor só muda quando a confirmação passa e a página
  // volta do servidor com o estado novo.
  function pedirTroca() {
    const title = ativo ? `Desativar "${nome}"?` : `Reativar "${nome}"?`;
    const description = ativo
      ? "Nenhum item novo será gerado até reativar (itens já criados ficam)."
      : "A geração mensal volta a partir do mês corrente.";
    requestConfirm({ title, description, destructive: ativo, confirmLabel: ativo ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      {/* O nome fica fixo e o estado vem do `aria-checked`: um nome que muda
          com o estado ("Clique para desativar") repetia o que o interruptor
          já diz. "Ativa/Inativa" segue à vista; a largura fixa impede a coluna
          de pular ao trocar. */}
      <Switch
        checked={ativo}
        onCheckedChange={pedirTroca}
        rotulo={ativo ? "Ativa" : "Inativa"}
        aria-label={`Obrigação ativa: ${nome}`}
        className="min-w-[6.25rem]"
      />
      {dialog}
    </>
  );
}
