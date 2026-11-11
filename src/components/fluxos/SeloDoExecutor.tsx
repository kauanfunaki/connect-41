import { COR_DO_EXECUTOR, rotuloDoExecutor, type Executor } from "@/lib/fluxos/etapas";

/**
 * Quem executa a etapa ("Pessoa · DP", "Robô"), no desenho do SectorChip: um
 * ponto na cor do executor e o nome ao lado — a cor nunca diz sozinha
 * (10/11/2026, pedido do Kauan). As cores são tokens que o Connect já tem.
 */
export function SeloDoExecutor({ executor, rotuloDoSetor, className = "" }: { executor: Executor; rotuloDoSetor?: (codigo: string) => string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-hover px-2 py-0.5 text-micro font-medium leading-4 text-fg-secondary ${className}`.trim()}>
      <span aria-hidden className="size-[7px] shrink-0 rounded-full" style={{ background: COR_DO_EXECUTOR[executor.tipo] }} />
      {rotuloDoExecutor(executor, rotuloDoSetor)}
    </span>
  );
}
