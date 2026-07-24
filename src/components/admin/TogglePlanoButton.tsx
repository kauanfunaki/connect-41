"use client";

import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  active: boolean;
  nome: string;
};

export function TogglePlanoButton({ action, active, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = active ? `Desativar o plano "${nome}"?` : `Reativar o plano "${nome}" pra novas assinaturas?`;
    const description = active ? "Ele some das opções pra novas assinaturas, mas assinaturas existentes continuam." : undefined;
    requestConfirm({ title, description, destructive: active, confirmLabel: active ? "Desativar" : "Reativar" }, action);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          active
            ? "h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
            : "h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors"
        }
      >
        {active ? "Desativar" : "Ativar"}
      </button>
      {dialog}
    </>
  );
}
