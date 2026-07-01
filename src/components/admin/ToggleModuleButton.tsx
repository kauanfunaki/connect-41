"use client";

type Props = {
  action: () => Promise<void>;
  enabled: boolean;
  nome: string;
};

export function ToggleModuleButton({ action, enabled, nome }: Props) {
  async function handleClick() {
    const msg = enabled
      ? `Desativar o módulo "${nome}" para este tenant? Ele desaparece do menu e das rotas até ser reativado.`
      : `Ativar o módulo "${nome}" para este tenant?`;
    if (!confirm(msg)) return;
    await action();
  }

  return (
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
  );
}
