import { Card } from "@/components/ui/Card";
import { formatInstantDate } from "@/lib/format";
import type { TaxaNaTela } from "@/lib/societario/licencas-data";
import type { CustoDoProcesso } from "@/lib/societario/licencas";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moeda = (c: number) => MOEDA.format(c / 100);

type Props = { taxas: TaxaNaTela[]; custo: CustoDoProcesso };

export function TaxasDoProcesso({ taxas, custo }: Props) {
  if (taxas.length === 0) return null;

  const aPagar = custo.totalCentavos - custo.pagoCentavos;

  return (
    <Card as="section" className="p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-fg">Taxas</h2>
        <p className="text-[13px] tabular-nums text-fg">
          <strong>{moeda(custo.totalCentavos)}</strong>
          {aPagar > 0 && <span className="text-warning"> · {moeda(aPagar)} a pagar</span>}
        </p>
      </div>

      {/* O número que dá causa ao prazo: "trinta dias" sozinho não conta a
          história que "trinta dias e duas guias a mais" conta. */}
      {custo.custoDasVoltasCentavos > 0 && (
        <p className="text-[12px] text-warning bg-warning-bg border border-warning/30 rounded-md px-3 py-2">
          <strong>{moeda(custo.custoDasVoltasCentavos)}</strong> vieram de reapresentação — guia
          paga de novo porque o processo voltou.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
              <th className="py-2 pr-3 font-medium">Taxa</th>
              <th className="py-2 pr-3 font-medium">Órgão</th>
              <th className="py-2 pr-3 font-medium">Vencimento</th>
              <th className="py-2 pr-3 font-medium text-right">Valor</th>
              <th className="py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {taxas.map((t) => (
              <tr key={t.id} className="border-b border-border-soft">
                <td className="py-2.5 pr-3">
                  <span className="text-fg">{t.description}</span>
                  {/* Primeira via é o caminho normal; da segunda em diante é
                      volta, e é isso que o rótulo diz. */}
                  {t.attempt !== null && t.attempt >= 2 && (
                    <span className="block text-[11px] text-warning">{t.attempt}ª apresentação</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-fg-muted">{t.orgaoNome ?? "—"}</td>
                <td className="py-2.5 pr-3 tabular-nums text-fg-secondary whitespace-nowrap">
                  {t.dueDate ? formatInstantDate(t.dueDate) : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{moeda(t.amountCents)}</td>
                <td className="py-2.5 text-[12px]">
                  {t.paidAt ? (
                    <span className="text-success">pago em {formatInstantDate(t.paidAt)}</span>
                  ) : (
                    <span className="text-warning">em aberto</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
