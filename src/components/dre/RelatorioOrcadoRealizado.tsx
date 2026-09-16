import { Card } from "@/components/ui/Card";
import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { fracaoDaLinha, valorDaLinha } from "@/lib/dre/economica";
import { variacao, type Avaliacao } from "@/lib/dre/orcamento/variacao";
import { moeda, percentual } from "@/lib/financeiro/formato";

// A cor sai da avaliação (receita acima é melhor, despesa acima é pior), não do
// sinal do número — ver `src/lib/dre/orcamento/variacao.ts`.
const TOM: Record<Avaliacao, string> = { melhor: "text-success", pior: "text-danger", igual: "text-fg-muted" };
const TITULO: Record<Avaliacao, string> = { melhor: "Melhor que o orçado", pior: "Pior que o orçado", igual: "Igual ao orçado" };

const TH = "py-2 px-2 font-medium text-right whitespace-nowrap";

type Bloco = { rotulo: string; realizado: ResultadoDoDre; orcado: ResultadoDoDre };

function Celulas({ code, tipo, bloco, divisor }: { code: string; tipo: "grupo" | "subtotal" | "percentual"; bloco: Bloco; divisor: boolean }) {
  const borda = divisor ? "border-l border-border" : "";
  if (tipo === "percentual") {
    return (
      <>
        <td className={`py-1 px-2 text-right text-[11px] text-fg-muted tabular-nums ${borda}`}>{percentual(fracaoDaLinha(bloco.realizado, code))}</td>
        <td className="py-1 px-2 text-right text-[11px] text-fg-muted tabular-nums">{percentual(fracaoDaLinha(bloco.orcado, code))}</td>
        <td />
        <td />
      </>
    );
  }
  const v = variacao(code, valorDaLinha(bloco.realizado, code), valorDaLinha(bloco.orcado, code));
  return (
    <>
      <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${v.realizado < 0 ? "text-danger" : "text-fg"} ${borda}`}>{moeda(v.realizado)}</td>
      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap text-fg-secondary">{moeda(v.orcado)}</td>
      <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${TOM[v.avaliacao]}`} title={TITULO[v.avaliacao]}>
        {v.diferenca > 0 ? "+" : ""}
        {moeda(v.diferenca)}
      </td>
      <td className={`py-2 px-2 text-right tabular-nums whitespace-nowrap ${v.percentual === null ? "text-fg-muted" : TOM[v.avaliacao]}`} title={TITULO[v.avaliacao]}>
        {v.percentual !== null && v.percentual > 0 ? "+" : ""}
        {percentual(v.percentual)}
      </td>
    </>
  );
}

/**
 * A DRE econômica com o orçado ao lado: no mês e no acumulado do ano até o mês.
 *
 * Todas as linhas — grupos, subtotais e percentuais — saem do mesmo
 * `ResultadoDoDre` dos dois lados (o orçado passa por `montarLinhas` como o
 * realizado), então o subtotal orçado é a mesma conta do subtotal realizado.
 */
export function RelatorioOrcadoRealizado({ mes, acumulado }: { mes: Bloco; acumulado: Bloco }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-fg-muted">
              <th className="py-2 pl-4 pr-3 font-medium text-left" rowSpan={2}>
                Linha
              </th>
              <th className="py-2 px-2 font-medium text-center border-l border-border" colSpan={4}>
                {mes.rotulo}
              </th>
              <th className="py-2 px-2 pr-4 font-medium text-center border-l border-border" colSpan={4}>
                {acumulado.rotulo}
              </th>
            </tr>
            <tr className="text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className={`${TH} border-l border-border`}>Realizado</th>
              <th className={TH}>Orçado</th>
              <th className={TH}>Var. R$</th>
              <th className={TH}>Var. %</th>
              <th className={`${TH} border-l border-border`}>Realizado</th>
              <th className={TH}>Orçado</th>
              <th className={TH}>Var. R$</th>
              <th className={`${TH} pr-4`}>Var. %</th>
            </tr>
          </thead>
          <tbody>
            {mes.realizado.linhas.map((l) => (
              <tr
                key={l.code}
                className={
                  l.tipo === "percentual" ? "border-b border-border-soft" : l.destaque ? "border-b border-border bg-surface-hover" : "border-b border-border-soft"
                }
              >
                <td
                  className={
                    l.tipo === "percentual"
                      ? "py-1 pl-4 pr-3 text-[11px] text-fg-muted"
                      : `py-2 pl-4 pr-3 ${l.destaque ? "font-semibold text-fg" : l.tipo === "subtotal" ? "font-medium text-fg" : "text-fg-secondary"}`
                  }
                >
                  {l.label}
                </td>
                <Celulas code={l.code} tipo={l.tipo} bloco={mes} divisor />
                <Celulas code={l.code} tipo={l.tipo} bloco={acumulado} divisor />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
