// O fluxo de caixa — realizado e projeção — e o consolidado por empresa.
// Servem a tela interna e o portal, que só muda o escopo.

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MesDoFluxo, Projecao, LinhaDoConsolidado } from "@/lib/financeiro/fluxo";
import type { SaldoConsolidado } from "@/lib/financeiro/conciliacao/saldoConsolidado";
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

/**
 * Com saldo bancário, cada janela mostra também o **saldo projetado**: o das
 * contas mais os títulos até o fim dela. Sem saldo, fica só o resultado dos
 * títulos, como antes — somar zero seria afirmar um saldo que não se conhece.
 */
export function CartoesDaProjecao({ projecao, saldoInicial = null }: { projecao: Projecao; saldoInicial?: number | null }) {
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
            {saldoInicial !== null && (
              <p className={`text-[11px] tabular-nums mt-1 ${tomDoValor(saldoInicial + j.saldo)}`}>
                Saldo projetado: {moeda(saldoInicial + j.saldo)}
              </p>
            )}
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

/** O saldo das contas bancárias do escopo, vindo da conciliação. */
export function QuadroDoSaldoBancario({ saldo }: { saldo: SaldoConsolidado }) {
  const dataCurta = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
  if (saldo.contas.length === 0) {
    return (
      <Card className="p-3.5 mb-6 text-[12px] text-fg-muted">
        Nenhuma conta bancária ativa. Cadastre a conta e importe o extrato em{" "}
        <Link href="/conciliacao" className="text-brand hover:underline">
          Conciliação bancária
        </Link>{" "}
        para o fluxo mostrar o saldo real.
      </Card>
    );
  }
  return (
    <Card className="p-3.5 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] text-fg-muted">Saldo das contas</p>
        {saldo.atualizadoAteKey && <p className="text-[11px] text-fg-muted">extrato até {dataCurta(saldo.atualizadoAteKey)}</p>}
      </div>
      <p className={`text-[20px] font-semibold tabular-nums ${saldo.centavos === null ? "text-fg-muted" : tomDoValor(saldo.centavos)}`}>
        {saldo.centavos === null ? "—" : moeda(saldo.centavos)}
      </p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {saldo.contas.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="text-fg-secondary truncate">{c.nome}</span>
            <span className="tabular-nums">
              {c.saldo.centavos === null ? <span className="text-fg-muted">sem saldo</span> : moeda(c.saldo.centavos)}
              {c.saldo.origem === "banco" && <span className="text-fg-muted"> (do banco)</span>}
            </span>
          </li>
        ))}
      </ul>
      {(saldo.contasSemSaldo > 0 || saldo.contasDivergentes > 0) && (
        <p className="text-[11px] text-warning mt-2">
          {saldo.contasSemSaldo > 0 &&
            `${saldo.contasSemSaldo === 1 ? "1 conta ficou" : `${saldo.contasSemSaldo} contas ficaram`} fora do total por não ter saldo inicial nem extrato. `}
          {saldo.contasDivergentes > 0 &&
            `${saldo.contasDivergentes === 1 ? "1 conta não bate" : `${saldo.contasDivergentes} contas não batem`} com o saldo do banco — confira na conciliação.`}
        </p>
      )}
    </Card>
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
