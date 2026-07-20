"use client";

type Props = {
  action: () => Promise<void>;
  ativo: boolean;
  nome: string;
};

export function ToggleObrigacaoButton({ action, ativo, nome }: Props) {
  async function handleClick() {
    const msg = ativo
      ? `Desativar "${nome}"? Nenhum item novo será gerado até reativar (itens já criados ficam).`
      : `Reativar "${nome}"? A geração mensal volta a partir do mês corrente.`;
    if (!confirm(msg)) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={ativo ? "Clique para desativar" : "Clique para reativar"}
      className={`c41-toggle-active ${ativo ? "is-on" : ""}`}
    >
      {ativo ? "Ativa" : "Inativa"}
      <span className="switch" />
    </button>
  );
}
