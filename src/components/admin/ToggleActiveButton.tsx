"use client";

type Props = {
  action: () => Promise<void>;
  ativo: boolean;
  nome: string;
};

export function ToggleActiveButton({ action, ativo, nome }: Props) {
  async function handleClick() {
    const msg = ativo
      ? `Desativar "${nome}"? A pessoa perderá acesso ao Connect 41.`
      : `Reativar "${nome}"?`;
    if (!confirm(msg)) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        ativo
          ? "h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
          : "h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors"
      }
    >
      {ativo ? "Desativar" : "Reativar"}
    </button>
  );
}
