"use client";

type Props = {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
};

export function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface-elevated border border-brand/30 rounded-2xl shadow-[var(--c41-shadow-lg)] px-4 py-3">
      <span className="text-[14px] font-semibold text-fg whitespace-nowrap">
        {count} selecionado{count !== 1 ? "s" : ""}
      </span>
      <div className="w-px h-5 bg-border flex-shrink-0" />
      <div className="flex items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors ml-1 flex-shrink-0"
      >
        Limpar
      </button>
    </div>
  );
}
