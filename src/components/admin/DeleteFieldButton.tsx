"use client";

type Props = {
  action: () => Promise<void>;
  nome: string;
};

export function DeleteFieldButton({ action, nome }: Props) {
  async function handleClick() {
    if (!confirm(`Excluir o campo "${nome}"? Todos os valores preenchidos nele serão perdidos.`)) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-[12px] text-danger hover:underline"
    >
      Excluir
    </button>
  );
}
