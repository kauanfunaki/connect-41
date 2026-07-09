"use client";

type Props = {
  action: () => Promise<void>;
  ativo: boolean;
  nome: string;
};

export function ToggleActiveButton({ action, ativo, nome }: Props) {
  async function handleClick() {
    const msg = ativo
      ? `Desativar "${nome}"? A pessoa perderá acesso ao Connect.`
      : `Reativar "${nome}"?`;
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
      {ativo ? "Ativo" : "Inativo"}
      <span className="switch" />
    </button>
  );
}
