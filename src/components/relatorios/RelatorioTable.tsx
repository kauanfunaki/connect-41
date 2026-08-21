import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileSpreadsheet } from "lucide-react";

export type BadgeTone = "danger" | "warning" | "success" | "neutral" | "brand";

const TONE_CLASS: Record<BadgeTone, string> = {
  danger: "bg-danger/10 text-danger border-danger/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  success: "bg-success/10 text-success border-success/25",
  brand: "bg-brand/10 text-brand border-brand/25",
  neutral: "bg-surface-2 text-fg-secondary border-border",
};

export function RelatorioBadge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

export function ResumoChips({ items }: { items: { label: string; count: number; tone: BadgeTone }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {items.map((i) => (
        <RelatorioBadge key={i.label} tone={i.tone}>
          {i.count} {i.label}
        </RelatorioBadge>
      ))}
    </div>
  );
}

export type Column<T> = {
  header: string;
  /** Alinha à direita e usa tabular-nums — para datas, dias e valores. */
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Link da linha inteira (ficha da pessoa, normalmente). */
  rowHref?: (row: T) => string;
  emptyTitle: string;
  emptyDescription?: string;
  minWidth?: string;
};

// Tabela de relatório — mesma casca para os 4 relatórios, com scroll horizontal
// contido (o body da página nunca rola na horizontal) e a primeira coluna
// fixa, que é sempre o nome da pessoa.
export function RelatorioTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  emptyTitle,
  emptyDescription,
  minWidth = "720px",
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<FileSpreadsheet />} title={emptyTitle} description={emptyDescription} />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="scroll-x overflow-x-auto">
        <table className="w-full text-[13px]" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-border bg-surface-2">
              {columns.map((c, i) => (
                <th
                  key={c.header}
                  scope="col"
                  className={`px-4 py-2.5 text-[12px] font-medium text-fg-muted ${
                    c.numeric ? "text-right" : "text-left"
                  } ${i === 0 ? "sticky left-0 bg-surface-2" : ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors">
                {columns.map((c, i) => (
                  <td
                    key={c.header}
                    className={`px-4 py-2.5 ${c.numeric ? "text-right tnum" : ""} ${
                      i === 0 ? "sticky left-0 bg-surface font-medium text-fg" : "text-fg-secondary"
                    }`}
                  >
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(row)} className="hover:text-brand transition-colors">
                        {c.render(row)}
                      </Link>
                    ) : (
                      c.render(row)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
