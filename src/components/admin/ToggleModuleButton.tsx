"use client";

import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  action: () => Promise<void>;
  enabled: boolean;
  nome: string;
};

export function ToggleModuleButton({ action, enabled, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();

  function handleClick() {
    const title = enabled ? `Desativar o módulo "${nome}" para este tenant?` : `Ativar o módulo "${nome}" para este tenant?`;
    const description = enabled ? "Ele desaparece do menu e das rotas até ser reativado." : undefined;
    requestConfirm({ title, description, destructive: enabled, confirmLabel: enabled ? "Desativar" : "Ativar" }, action);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          enabled
            ? "h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
            : "h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors"
        }
      >
        {enabled ? "Desativar" : "Ativar"}
      </button>
      {dialog}
    </>
  );
}
