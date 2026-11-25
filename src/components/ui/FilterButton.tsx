"use client";

import { ListFilter } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";

type Props = {
  /** Quantos filtros estruturados (fora a busca) estão ativos agora — mostra o número num selo e destaca o botão. */
  activeCount?: number;
  align?: "left" | "right";
  width?: number;
  /** Ver `Dropdown`: o painel não rola, e o conteúdo cuida da própria rolagem. */
  semRolagem?: boolean;
  children: React.ReactNode | ((props: { close: () => void }) => React.ReactNode);
};

// Botão "Filtros" que abre um painel ancorado (Dropdown) em vez de espalhar
// select/tabs numa fileira acima da tabela — mesmo idioma que já existia
// duplicado em ConversasFilterBar e no Kanban (BoardView), generalizado aqui
// pra virar o padrão único de filtro estruturado do app. Busca por texto
// continua fora do painel (é "ao vivo", não combina com o padrão
// aplicar/fechar de filtro estruturado).
export function FilterButton({ activeCount = 0, align = "right", width = 260, semRolagem = false, children }: Props) {
  return (
    <Dropdown
      align={align}
      width={width}
      semRolagem={semRolagem}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={activeCount > 0 ? `Filtros, ${activeCount} ${activeCount === 1 ? "ligado" : "ligados"}` : "Filtros"}
          // h-8 desde 30/09: a busca compacta e os botões sm da mesma barra têm 32px,
          // e o Filtros com 36px era o único degrau da linha.
          //
          // Com filtro ligado (25/11/2026, melhoria-815): borda e ícone na cor da
          // marca e o número num selo cheio. Antes era o mesmo fundo claro do
          // painel aberto, com "(N)" no texto — passava despercebido, e a lista
          // filtrada parecia a lista inteira.
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-button-sm font-semibold transition-colors flex-shrink-0 ${
            activeCount > 0
              ? "border-brand bg-brand-subtle text-fg hover:bg-brand-subtle/70"
              : open
                ? "border-brand/40 bg-brand-subtle text-fg"
                : "border-border-strong text-fg-secondary hover:bg-surface-hover"
          }`}
        >
          <ListFilter size={14} aria-hidden className={activeCount > 0 ? "text-brand" : undefined} />
          Filtros
          {activeCount > 0 && (
            <span aria-hidden className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-micro font-semibold text-on-brand [font-variant-numeric:tabular-nums]">
              {activeCount}
            </span>
          )}
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
      <p className="c41-rotulo px-1">{label}</p>
      {children}
    </div>
  );
}
