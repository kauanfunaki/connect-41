import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FileSpreadsheet } from "lucide-react";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { Selo } from "@/components/ui/Selo";

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
    <Selo cor={TONE_CLASS[tone]}>
      {children}
    </Selo>
  );
}

/** A cor do número no cartão de total (`FaixaDeTotais`) para cada tom de selo. */
export const TOM_DO_TOTAL: Record<BadgeTone, string | undefined> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  brand: "text-brand",
  neutral: undefined,
};

export type Column<T> = {
  header: string;
  /** Datas, dias e valores — números tabulares. */
  numeric?: boolean;
  render: (row: T) => React.ReactNode;
  /**
   * Funil da coluna, como o do Excel: o texto de cada linha que entra no
   * filtro (data em ISO AAAA-MM-DD, com `tipo: "data"`). Só em coluna de valor
   * repetido — situação, empresa, cargo; em valor único não serve.
   */
  filtro?: { chave: string; valor: (row: T) => string; tipo?: "data" };
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
//
// Desde 30/09 no casco padrão (`c41-tabela`: centralizada, cabeçalho com fundo,
// fio azul no hover) e com funil nas colunas que declaram `filtro`. A coluna
// fixa acompanha o fundo do cabeçalho e o hover da linha — sem isso ficava um
// retângulo branco no meio da linha acesa.
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

  const comFiltro = columns.filter((c) => c.filtro);
  const ultimaComFiltro = comFiltro[comFiltro.length - 1];

  return (
    <TabelaFiltravel
      linhas={rows.map((row) => ({
        id: rowKey(row),
        valores: Object.fromEntries(comFiltro.map((c) => [c.filtro!.chave, c.filtro!.valor(row)])),
      }))}
    >
      <div className="c41-tabela scroll-x overflow-x-auto bg-surface border border-border rounded-lg">
        <table className="w-full text-[13px]" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-border">
              {columns.map((c, i) => (
                <th
                  key={c.header}
                  scope="col"
                  className={`px-4 py-2.5 text-[12px] font-medium text-fg-muted ${
                    i === 0 ? "sticky left-0 z-[1] bg-[var(--c41-table-header-bg)]" : ""
                  }`}
                >
                  {c.filtro ? (
                    <FiltroDaColuna
                      rotulo={c.header}
                      chave={c.filtro.chave}
                      tipo={c.filtro.tipo}
                      align={c === ultimaComFiltro && i > columns.length / 2 ? "right" : "left"}
                    />
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <LinhaFiltravel key={rowKey(row)} id={rowKey(row)} className="group border-b border-border">
                {columns.map((c, i) => (
                  <td
                    key={c.header}
                    className={`px-4 py-2.5 ${c.numeric ? "tnum" : ""} ${
                      i === 0
                        ? "sticky left-0 z-[1] bg-surface group-hover:bg-surface-hover font-medium text-fg transition-colors"
                        : "text-fg-secondary"
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
              </LinhaFiltravel>
            ))}
          </tbody>
        </table>
      </div>
    </TabelaFiltravel>
  );
}
