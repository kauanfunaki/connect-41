"use client";

type Props = {
  aceitarAction: () => Promise<void>;
  rejeitarAction: () => Promise<void>;
};

export function HandoffActions({ aceitarAction, rejeitarAction }: Props) {
  async function handleAceitar() {
    if (!confirm("Aceitar esta transferência? A entidade passa a ser acompanhada pelo setor de destino.")) return;
    await aceitarAction();
  }

  async function handleRejeitar() {
    if (!confirm("Rejeitar esta transferência?")) return;
    await rejeitarAction();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleAceitar}
        className="h-8 px-3 rounded-md border border-success/30 text-[12px] font-medium text-success hover:bg-success/8 transition-colors"
      >
        Aceitar
      </button>
      <button
        type="button"
        onClick={handleRejeitar}
        className="h-8 px-3 rounded-md border border-danger/30 text-[12px] font-medium text-danger hover:bg-danger/8 transition-colors"
      >
        Rejeitar
      </button>
    </div>
  );
}
