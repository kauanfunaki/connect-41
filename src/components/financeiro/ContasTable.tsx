import Link from "next/link";
import { FileText, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate } from "@/lib/format";
import { reaisDeCentavos, type SituacaoDaConta } from "@/lib/financeiro/contas";
import type { LinhaDaConta, TipoDeConta } from "@/lib/financeiro/data";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function moeda(cents: number): string {
  return MOEDA.format(reaisDeCentavos(cents));
}

export const SITUACAO_LABEL: Record<SituacaoDaConta, string> = {
  VENCIDA: "Vencida",
  VENCE_HOJE: "Vence hoje",
  A_VENCER: "A vencer",
  PAGA: "Paga",
  CANCELADA: "Cancelada",
};

// Vencida é `danger` e vence-hoje é `warning`: a diferença entre "já custa" e
// "ainda dá para resolver" precisa ser lida sem ninguém comparar datas.
const SITUACAO_VARIANTE: Record<SituacaoDaConta, "danger" | "warning" | "info" | "success"> = {
  VENCIDA: "danger",
  VENCE_HOJE: "warning",
  A_VENCER: "info",
  PAGA: "success",
  CANCELADA: "info",
};

type Props = {
  linhas: LinhaDaConta[];
  kind: TipoDeConta;
  /** Existem contas deste tipo, mas nenhuma passou pelo recorte. */
  filtrado: boolean;
};

export function ContasTable({ linhas, kind, filtrado }: Props) {
  if (linhas.length === 0) {
    return filtrado ? (
      <EmptyState
        title="Nada neste recorte"
        description="Troque o filtro acima para ver as outras."
        icon={<FileText />}
      />
    ) : (
      <EmptyState
        title={kind === "PAGAR" ? "Nenhuma conta a pagar" : "Nenhuma conta a receber"}
        description="As contas nascem do documento fiscal, na ficha dele. Lance um documento para vê-lo aqui."
        icon={<FileText />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
            <th className="py-2 pr-3 font-medium">Vencimento</th>
            <th className="py-2 pr-3 font-medium">
              {kind === "PAGAR" ? "Fornecedor" : "Cliente"}
            </th>
            <th className="py-2 pr-3 font-medium">Empresa</th>
            <th className="py-2 pr-3 font-medium">Categoria</th>
            <th className="py-2 pr-3 font-medium">Competência</th>
            <th className="py-2 pr-3 font-medium text-right">Valor</th>
            <th className="py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
              <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                {formatInstantDate(l.vencimento)}
                {l.pagoEm && (
                  <span className="block text-[11px] text-fg-muted">
                    pago em {formatInstantDate(l.pagoEm)}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3">
                <span className="font-medium">{l.contraparteNome}</span>
                {l.descricao && (
                  <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">
                    {l.descricao}
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
              <td className="py-2.5 pr-3">
                {l.categoriaNome ?? (
                  // Categoria é obrigatória em PAGAR (`categoriaObrigatoria`), então
                  // a ausência aqui é pendência de classificação, não campo vazio.
                  <span className="inline-flex items-center gap-1 text-warning text-[12px]">
                    <AlertCircle size={12} /> sem categoria
                  </span>
                )}
              </td>
              <td className="py-2.5 pr-3 text-fg-muted tabular-nums">{l.competencia}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                {moeda(l.valorCentavos)}
              </td>
              <td className="py-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant={SITUACAO_VARIANTE[l.situacao]}>{SITUACAO_LABEL[l.situacao]}</Badge>
                  {l.documentoId && (
                    <Link
                      href={`/documentos-fiscais/${l.documentoId}`}
                      className="text-brand hover:underline text-[12px] whitespace-nowrap"
                    >
                      ver nota
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
