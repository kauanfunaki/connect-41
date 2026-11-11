import { Flame } from "lucide-react";
import { diasEmTexto } from "@/lib/academia/sequencia";

/**
 * A pílula da sequência de dias (Fase 2, 11/11/2026, pedido do Kauan): chama
 * e número, branco sobre o âmbar, como um selo. `topo` é a do chapéu do
 * topo (pequena, centrada embaixo do ícone); sem ele, a do Início.
 */
export function ChamaDaSequencia({ dias, topo = false }: { dias: number; topo?: boolean }) {
  if (topo) {
    return (
      <span
        aria-hidden
        className="inline-flex h-4 min-w-6 items-center justify-center gap-0.5 rounded-full bg-warning px-1 text-[10px] font-bold leading-none text-white tabular-nums shadow-xs ring-2 ring-surface"
      >
        <Flame size={9} strokeWidth={2.75} />
        {dias}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-helper font-semibold text-white tabular-nums">
      <Flame size={13} aria-hidden strokeWidth={2.5} />
      {diasEmTexto(dias)} {dias === 1 ? "seguido" : "seguidos"}
    </span>
  );
}

/** O evento que a tela do desafio solta ao terminar, para o chapéu do topo atualizar a chama sem recarregar. */
export const EVENTO_DA_SEQUENCIA = "academia:sequencia";
