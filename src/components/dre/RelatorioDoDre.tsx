import { Card } from "@/components/ui/Card";
import type { ResultadoDoDre } from "@/lib/dre/calculo";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PCT = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1 });

export function moeda(centavos: number): string {
  return MOEDA.format(centavos / 100);
}

type Props = { resultado: ResultadoDoDre };

export function RelatorioDoDre({ resultado }: Props) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-[13px]">
          <tbody>
            {resultado.linhas.map((l) => {
              if (l.tipo === "percentual") {
                return (
                  <tr key={l.code} className="border-b border-border-soft">
                    <td className="py-1 pl-4 pr-3 text-[11px] text-fg-muted">{l.label}</td>
                    <td className="py-1 pr-4 text-right text-[11px] text-fg-muted tabular-nums">
                      {/* Vazio, e não "0%": a planilha escreve IF(x=0,"") e é a
                          leitura certa — "não dá para calcular" não é zero. */}
                      {l.fracao === null ? "—" : PCT.format(l.fracao)}
                    </td>
                  </tr>
                );
              }

              const negativo = (l.centavos ?? 0) < 0;
              return (
                <tr
                  key={l.code}
                  className={
                    l.destaque
                      ? "border-b border-border bg-surface-hover"
                      : "border-b border-border-soft"
                  }
                >
                  <td
                    className={`py-2 pl-4 pr-3 ${
                      l.destaque ? "font-semibold text-fg" : l.tipo === "subtotal" ? "font-medium text-fg" : "text-fg-secondary"
                    }`}
                  >
                    {l.label}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums whitespace-nowrap ${
                      l.destaque ? "font-semibold" : ""
                    } ${negativo ? "text-danger" : "text-fg"}`}
                  >
                    {moeda(l.centavos ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
