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

const DATA_CURTA = { day: "2-digit", month: "short" } as const;

/**
 * A seção "Listas" do Espaço e da Pasta: Lista | Progresso X/Y | Início | Término.
 *
 * Era uma pilha de linhas-link sem cabeçalho (até 30/09) — as duas datas
 * apareciam lado a lado sem dizer qual era qual. Virou tabela no casco padrão
 * (`.c41-tabela`), com o nome como link e o "…" na última célula; antes o menu
 * flutuava por cima da linha, porque a linha inteira era um <Link> e botão
 * dentro de link é HTML inválido. Sem funil: o nome é único e são poucas listas
 * por espaço. No celular ficam só o nome e o menu, como antes.
 */
export function ListsTable({ lists, basePath, deleteAction }: Props) {
  if (lists.length === 0) return null;

  return (
    <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
      <table className="w-full text-[length:var(--fs-ui)]">
        <thead>
          <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
            <th className="px-4 py-3">Lista</th>
            <th className="px-4 py-3 w-44 hidden sm:table-cell">Progresso</th>
            <th className="px-4 py-3 w-28 hidden md:table-cell">Início</th>
            <th className="px-4 py-3 w-28 hidden md:table-cell">Término</th>
            {deleteAction && (
              <th className="px-4 py-3 w-14">
                <span className="sr-only">Ações</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {lists.map((l) => {
            const pct = l.total > 0 ? Math.round((l.done / l.total) * 100) : 0;
            return (
              <tr key={l.id} className="border-b border-border">
                <td className="px-4 py-2.5">
                  <Link
                    href={`${basePath}/${l.id}`}
                    className="inline-flex items-center gap-2 max-w-full font-medium text-fg hover:text-brand transition-colors"
                  >
                    <span className="w-[9px] h-[9px] rounded-full flex-shrink-0" style={{ background: l.color ?? "#586577" }} />
                    <span className="truncate max-w-[28rem]" title={l.name}>
                      {l.name}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell">
                  {l.total > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] text-fg-muted tnum flex-shrink-0">
                        {l.done}/{l.total}
                      </span>
                    </div>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-fg-muted whitespace-nowrap hidden md:table-cell">
                  {l.startDate ? formatCalendarDate(l.startDate, DATA_CURTA) : "—"}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-fg-muted whitespace-nowrap hidden md:table-cell">
                  {l.endDate ? formatCalendarDate(l.endDate, DATA_CURTA) : "—"}
                </td>
                {deleteAction && (
                  <td className="px-4 py-2.5">
                    <DeleteEntityMenu kind="lista" name={l.name} action={deleteAction.bind(null, l.id)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
