"use client";

type Props = {
  action: () => Promise<void>;
  nome: string;
};

export function DeleteButton({ action, nome }: Props) {
  async function handleClick() {
    if (!confirm(`Remover "${nome}" deste pipeline? Esta ação não pode ser desfeita.`)) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors flex-shrink-0"
    >
      Remover
    </button>
  );
}
