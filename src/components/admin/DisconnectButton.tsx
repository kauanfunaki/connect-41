"use client";

type Props = {
  action: () => Promise<void>;
};

export function DisconnectButton({ action }: Props) {
  async function handleClick() {
    if (!confirm("Desconectar esta conta? Reuniões já agendadas continuam existindo, mas você não conseguirá criar novas até reconectar.")) return;
    await action();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="h-9 px-3 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
    >
      Desconectar
    </button>
  );
}
