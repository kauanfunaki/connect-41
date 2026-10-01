"use client";

import { ListFilter } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

type Props = {
  /** Quantos filtros estruturados (fora a busca) estão ativos agora — mostra "(N)" no botão e o destaca. */
  activeCount?: number;
  align?: "left" | "right";
  width?: number;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
};

// Botão "Filtros" que abre um painel ancorado (Dropdown) em vez de espalhar
// select/tabs numa fileira acima da tabela — mesmo idioma que já existia
// duplicado em ConversasFilterBar e no Kanban (BoardView), generalizado aqui
// pra virar o padrão único de filtro estruturado do app. Busca por texto
// continua fora do painel (é "ao vivo", não combina com o padrão
// aplicar/fechar de filtro estruturado).
export function FilterButton({ activeCount = 0, align = "right", width = 260, children }: Props) {
  return (
    <Dropdown
      align={align}
      width={width}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          // h-8 desde 30/09: a busca compacta e os botões sm da mesma barra têm 32px,
          // e o Filtros com 36px era o único degrau da linha.
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[length:var(--fs-button-sm)] font-semibold transition-colors flex-shrink-0 ${
            activeCount > 0 || open
              ? "border-brand/40 bg-brand-subtle text-fg"
              : "border-border-strong text-fg-secondary hover:bg-surface-hover"
          }`}
        >
          <ListFilter size={14} />
          Filtros
          {activeCount > 0 && <span className="[font-variant-numeric:tabular-nums]">({activeCount})</span>}
        </button>
      )}
    >
      {children}
    </Dropdown>
  );
}

export function FilterButtonSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-[0.04em] px-1">{label}</p>
      {children}
    </div>
  );
}
