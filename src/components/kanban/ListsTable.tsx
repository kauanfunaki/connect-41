import Link from "next/link";
import { formatCalendarDate } from "@/lib/format";
import { DeleteEntityMenu } from "@/components/kanban/DeleteEntityMenu";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type ListRow = {
  id: string;
  name: string;
  color: string | null;
  done: number;
  total: number;
  startDate: Date | null;
  endDate: Date | null;
};

type Props = {
  lists: ListRow[];
  basePath: string;
  /** Quando presente, cada linha ganha o menu "…" com Excluir lista. Recebe a
   * server action crua (não uma closure): quem passa é um Server Component, e
   * ali só o `.bind` de uma action consegue atravessar a fronteira. */
  deleteAction?: (pipelineId: string) => Promise<PipelineState>;
};

// Layout em tabela da seção "Listas" (Espaço e Pasta): Nome | Cor | Progresso
// X/Y | Início | Término.
export function ListsTable({ lists, basePath, deleteAction }: Props) {
  if (lists.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-lg divide-y divide-border">
      {lists.map((l) => {
        const pct = l.total > 0 ? Math.round((l.done / l.total) * 100) : 0;
        return (
          // O menu é irmão do <Link> (ver DeleteEntityMenu) — daí o wrapper
          // relativo em vez de um <Link> direto como filho do divide-y.
          <div key={l.id} className="relative">
            <Link
              href={`${basePath}/${l.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover transition-colors"
            >
              <span className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: l.color ?? "#586577" }} />
              <span className="flex-1 min-w-0 truncate text-[13px] text-fg font-medium">{l.name}</span>
              {l.total > 0 && (
                <div className="hidden sm:flex items-center gap-2 flex-shrink-0 w-32">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[11px] text-fg-muted tnum flex-shrink-0">{l.done}/{l.total}</span>
                </div>
              )}
              <span className="text-[11px] text-fg-muted flex-shrink-0 w-20 hidden md:inline">
                {l.startDate ? formatCalendarDate(l.startDate, { day: "2-digit", month: "short" }) : "—"}
              </span>
              <span className="text-[11px] text-fg-muted flex-shrink-0 w-20 hidden md:inline">
                {l.endDate ? formatCalendarDate(l.endDate, { day: "2-digit", month: "short" }) : "—"}
              </span>
              {/* Reserva a faixa do menu para o conteúdo não passar por baixo dele. */}
              {deleteAction && <span className="w-6 flex-shrink-0" />}
            </Link>
            {deleteAction && (
              <div className="absolute top-1/2 -translate-y-1/2 right-3">
                <DeleteEntityMenu kind="lista" name={l.name} action={deleteAction.bind(null, l.id)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
