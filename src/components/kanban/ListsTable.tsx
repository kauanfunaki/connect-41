import Link from "next/link";
import { formatCalendarDate } from "@/lib/format";

export type ListRow = {
  id: string;
  name: string;
  color: string | null;
  done: number;
  total: number;
  startDate: Date | null;
  endDate: Date | null;
};

// Layout em tabela da seção "Listas" (Espaço e Pasta): Nome | Cor | Progresso
// X/Y | Início | Término.
export function ListsTable({ lists, basePath }: { lists: ListRow[]; basePath: string }) {
  if (lists.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-lg divide-y divide-border">
      {lists.map((l) => {
        const pct = l.total > 0 ? Math.round((l.done / l.total) * 100) : 0;
        return (
          <Link
            key={l.id}
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
          </Link>
        );
      })}
    </div>
  );
}
