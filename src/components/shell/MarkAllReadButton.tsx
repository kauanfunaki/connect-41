"use client";

type Props = {
  action: () => Promise<void>;
};

export function MarkAllReadButton({ action }: Props) {
  return (
    <button
      type="button"
      onClick={() => action()}
      className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
    >
      Marcar todas como lidas
    </button>
  );
}
