"use client";

type Props = {
  count: number;
  onClear: () => void;
  children: React.ReactNode;
};

export function BulkActionBar({ count, onClear, children }: Props) {
  if (count === 0) return null;

  return (
    // Centralizada por translate a partir de sm. No celular ela não cabe
    // centralizada: presa às duas margens e com `flex-wrap`, o conteúdo quebra
    // em linhas em vez de sair pelos lados da tela — antes, "Excluir" e
    // "Limpar" ficavam fora do viewport e a seleção virava um beco sem saída.
    <div className="fixed bottom-4 sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-30 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-surface-elevated border border-brand/30 rounded-lg shadow-[var(--c41-shadow-lg)] px-4 py-3">
      <span className="text-[14px] font-semibold text-fg whitespace-nowrap">
        {count} selecionado{count !== 1 ? "s" : ""}
      </span>
      <div className="hidden sm:block w-px h-5 bg-border flex-shrink-0" />
      <div className="flex flex-wrap items-center justify-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="text-[13px] font-medium text-fg-muted hover:text-fg transition-colors sm:ml-1 flex-shrink-0"
      >
        Limpar
      </button>
    </div>
  );
}
