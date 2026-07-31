"use client";

import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  ativo: boolean;
  nome: string;
};

export function ToggleObrigacaoButton({ action, ativo, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = ativo ? `Desativar "${nome}"?` : `Reativar "${nome}"?`;
    const description = ativo
      ? "Nenhum item novo será gerado até reativar (itens já criados ficam)."
      : "A geração mensal volta a partir do mês corrente.";
    requestConfirm({ title, description, destructive: ativo, confirmLabel: ativo ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title={ativo ? "Clique para desativar" : "Clique para reativar"} aria-label={ativo ? "Clique para desativar" : "Clique para reativar"}
        className={`c41-toggle-active ${ativo ? "is-on" : ""}`}
      >
        {ativo ? "Ativa" : "Inativa"}
        <span className="switch" />
      </button>
      {dialog}
    </>
  );
}
