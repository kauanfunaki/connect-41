"use client";

type Props = {
  action: () => Promise<void>;
  ativa: boolean;
};

/**
 * Ativa/desativa uma categoria do plano de contas.
 *
 * Não há botão de excluir nesta tela de propósito: a FK dos lançamentos é
 * `ON DELETE SET NULL`, então apagar desclassificaria os lançamentos antigos.
 */
export function ToggleCategoriaButton({ action, ativa }: Props) {
  return (
    <button
      type="button"
      onClick={() => action()}
      className={
        ativa
          ? "h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors flex-shrink-0"
          : "h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors flex-shrink-0"
      }
    >
      {ativa ? "Desativar" : "Reativar"}
    </button>
  );
}
