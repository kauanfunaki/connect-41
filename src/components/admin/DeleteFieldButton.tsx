"use client";

import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  nome: string;
};

export function DeleteFieldButton({ action, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    requestConfirm(
      { title: `Excluir o campo "${nome}"?`, description: "Todos os valores preenchidos nele serão perdidos.", destructive: true, confirmLabel: "Excluir" },
      action
    );
  }

  return (
    <>
      <button type="button" onClick={handleClick} className="text-[12px] text-danger hover:underline">
        Excluir
      </button>
      {dialog}
    </>
  );
}
