// O fluxo de caixa — realizado e projeção — e o consolidado por empresa.
// Servem a tela interna e o portal, que só muda o escopo.

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MesDoFluxo, Projecao, LinhaDoConsolidado } from "@/lib/financeiro/fluxo";
import { moeda, tomDoValor } from "@/lib/financeiro/formato";

const CABECALHO = "text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border";

export function TabelaDoRealizado({ meses }: { meses: MesDoFluxo[] }) {
  const maior = Math.max(1, ...meses.flatMap((m) => [m.entradas, m.saidas]));
  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className={CABECALHO}>
            <th className="py-2 pl-4 pr-3 font-medium">Mês</th>
            <th className="py-2 pr-3 font-medium text-right">Entradas</th>
            <th className="py-2 pr-3 font-medium text-right">Saídas</th>
            <th className="py-2 pr-3 font-medium text-right">Saldo do mês</th>
            <th className="py-2 pr-3 font-medium text-right">Acumulado</th>
            <th className="py-2 pr-4 font-medium w-[22%] hidden md:table-cell"></th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.competencia} className="border-b border-border-soft">
              <td className="py-2 pl-4 pr-3 font-medium">{m.rotulo}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-success">{moeda(m.entradas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-danger">{moeda(m.saidas)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${tomDoValor(m.saldoDoMes)}`}>{moeda(m.saldoDoMes)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums font-medium ${tomDoValor(m.saldoAcumulado)}`}>{moeda(m.saldoAcumulado)}</td>
              <td className="py-2 pr-4 hidden md:table-cell">
                {/* Duas barras, e não uma de saldo: entrada alta com saída alta é
                    outro mês que entrada baixa com saída baixa, com o mesmo saldo. */}
                <div className="flex flex-col gap-0.5" aria-hidden>
                  <div className="h-1.5 rounded bg-success" style={{ width: `${(m.entradas / maior) * 100}%` }} />
                  <div className="h-1.5 rounded bg-danger" style={{ width: `${(m.saidas / maior) * 100}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CartoesDaProjecao({ projecao }: { projecao: Projecao }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {projecao.janelas.map((j) => (
          <Card key={j.dias} className="p-3">
            <p className="text-[11px] text-fg-muted">Até {j.dias} dias</p>
            <p className={`text-[16px] font-semibold tabular-nums mt-0.5 ${tomDoValor(j.saldo)}`}>{moeda(j.saldo)}</p>
            <p className="text-[11px] text-fg-muted tabular-nums">
              +{moeda(j.entradas)} / −{moeda(j.saidas)}
            </p>
          </Card>
        ))}
      </div>
      {(projecao.vencidos.entradas > 0 || projecao.vencidos.saidas > 0) && (
        <p className="text-[12px] text-warning mt-3">
          Fora das janelas: {moeda(projecao.vencidos.entradas)} a receber e {moeda(projecao.vencidos.saidas)} a pagar já
          vencidos e não baixados.
        </p>
      )}
    </>
  );
}

export function TabelaDoConsolidado({
  linhas,
  nomes,
  linkParaContas,
}: {
  linhas: LinhaDoConsolidado[];
  nomes: Map<string, string>;
  /** Na tela interna, a vencida leva à lista. No portal, não há para onde levar. */
  linkParaContas?: boolean;
}) {
  if (linhas.length === 0) {
    return <EmptyState title="Nenhuma empresa com movimento ou conta vencida neste mês" />;
  }
  const vencidas = (companyId: string, n: number, base: string) =>
    n === 0 ? (
      <span className="text-fg-muted">0</span>
    ) : linkParaContas ? (
      <Link href={`${base}?empresa=${companyId}&recorte=vencidas`} className="text-danger hover:underline">
        {n}
      </Link>
    ) : (
      <span className="text-danger">{n}</span>
    );

  return (
    <div className="overflow-x-auto border border-border rounded-lg bg-surface">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className={CABECALHO}>
            <th className="py-2 pl-4 pr-3 font-medium">Empresa</th>
            <th className="py-2 pr-3 font-medium text-right">Pago no mês</th>
            <th className="py-2 pr-3 font-medium text-right">Recebido no mês</th>
            <th className="py-2 pr-3 font-medium text-right">Saldo</th>
            <th className="py-2 pr-3 font-medium text-right">Vencidas a pagar</th>
            <th className="py-2 pr-4 font-medium text-right">Vencidas a receber</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.companyId} className="border-b border-border-soft">
              <td className="py-2 pl-4 pr-3 font-medium">{nomes.get(l.companyId) ?? "—"}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.pago)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{moeda(l.recebido)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${tomDoValor(l.saldo)}`}>{moeda(l.saldo)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{vencidas(l.companyId, l.vencidasPagar, "/pagar")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{vencidas(l.companyId, l.vencidasReceber, "/receber")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
