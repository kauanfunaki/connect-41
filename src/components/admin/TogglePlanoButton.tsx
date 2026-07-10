"use client";

type Props = {
  action: () => Promise<void>;
  active: boolean;
  nome: string;
};

export function TogglePlanoButton({ action, active, nome }: Props) {
  async function handleClick() {
    const msg = active
      ? `Desativar o plano "${nome}"? Ele some das opções pra novas assinaturas, mas assinaturas existentes continuam.`
      : `Reativar o plano "${nome}" pra novas assinaturas?`;
    if (!confirm(msg)) return;
    await action();
  }

  return (
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
  );
}
