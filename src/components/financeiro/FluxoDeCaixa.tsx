// O fluxo de caixa — realizado e projeção — e o consolidado por empresa.
// Servem a tela interna e o portal, que só muda o escopo.

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Cartao } from "@/components/shared/ListaResponsiva";
import { ColunasPareadas, numeroCurto } from "@/components/shared/Graficos";
import type { MesDoFluxo, Projecao, LinhaDoConsolidado } from "@/lib/financeiro/fluxo";
import type { SaldoConsolidado } from "@/lib/financeiro/conciliacao/saldoConsolidado";
import { moeda } from "@/lib/financeiro/formato";

const CABECALHO = "text-left text-micro uppercase tracking-wide text-fg-muted border-b border-border";

/**
 * O realizado em texto neutro, e só o saldo negativo em vermelho (07/10,
 * auditoria dos gráficos): entrada e saída são categoria, não situação — a
 * coluna inteira verde ou vermelha, até "R$ 0,00", gastava a cor que avisa.
 * O "−" do valor já diz o sinal.
 *
 * Desde 08/10/2026 vale para todo saldo desta tela — projeção, saldo das
 * contas e consolidado por empresa —, que ainda pintavam o positivo de verde
 * (escolha 9A do Kauan na página de decisões: zero sem cor, e cor só no que
 * pede atenção).
 */
function tomDoSaldo(centavos: number): string {
  return centavos < 0 ? "text-danger" : centavos === 0 ? "text-fg-muted" : "text-fg";
}

/** "17,2 mil" em cima da coluna — o "R$" está no título do gráfico. */
function reaisCurtos(centavos: number): string {
  return numeroCurto(centavos / 100);
}

/**
 * Entradas × saídas mês a mês, acima da tabela (08/10/2026, escolha 9A do
 * Kauan: o Fluxo com os gráficos da Home). Substitui as duas barrinhas de 6px
 * verde e vermelha da última coluna, que não tinham legenda nem leitura para
 * leitor de tela: agora são colunas pareadas no azul da marca — o que sai dois
 * degraus mais claro —, com o total de cada série na legenda, a dica com o
 * saldo do mês e a tabela acessível. Mês sem movimento não desenha coluna.
 * Duas séries, e não uma de saldo, como as barrinhas já faziam: entrada alta
 * com saída alta é outro mês que entrada baixa com saída baixa, com o mesmo
 * saldo.
 */
function GraficoDoRealizado({ meses }: { meses: MesDoFluxo[] }) {
  if (meses.length === 0) return null;
  const periodo = meses.length === 1 ? meses[0]!.rotulo : `${meses[0]!.rotulo} a ${meses.at(-1)!.rotulo}`;
  return (
    <Card className="p-4 mb-3">
      <ColunasPareadas
        titulo={`Entradas e saídas por mês, em R$ — ${periodo}`}
        series={["Entradas", "Saídas"]}
        pares={meses.map((m) => ({
          chave: m.competencia,
          rotulo: m.rotulo,
          valores: [m.entradas, m.saidas],
          dica: `Saldo do mês: ${moeda(m.saldoDoMes)}`,
        }))}
        formatar={moeda}
        formatarCurto={reaisCurtos}
        vazio="Nenhuma entrada ou saída baixada no período."
      />
    </Card>
  );
}

/**
 * O realizado: o gráfico de entradas × saídas e, embaixo, a tabela (cartões no
 * celular). O gráfico mora aqui dentro, e não na página, para o portal — que
 * usa este mesmo componente — recebê-lo sem mudar a tela dele.
 */
export function TabelaDoRealizado({ meses }: { meses: MesDoFluxo[] }) {
  return (
    <>
      <GraficoDoRealizado meses={meses} />
      {/* No celular, um cartão por mês (02/10/2026): a tabela de cinco colunas
          rolava de lado no portal e cortava os títulos. A troca é em `md`, e o
          cartão é o `Cartao`, como nas outras listas (08/10/2026): em `sm`,
          entre 640 e 768px o fluxo mostrava a tabela rolando e as irmãs, cartões. */}
      <ul className="md:hidden flex flex-col gap-2">
        {meses.map((m) => (
          <li key={m.competencia}>
            <Cartao>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium text-fg">{m.rotulo}</span>
              <span className="text-right">
                <span className="block text-micro text-fg-muted">Acumulado</span>
                <span className={`tabular-nums font-semibold ${tomDoSaldo(m.saldoAcumulado)}`}>{moeda(m.saldoAcumulado)}</span>
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <ParNoCartao rotulo="Entradas" valor={moeda(m.entradas)} tom={m.entradas === 0 ? "text-fg-muted" : undefined} />
              <ParNoCartao rotulo="Saídas" valor={moeda(m.saidas)} tom={m.saidas === 0 ? "text-fg-muted" : undefined} />
              <ParNoCartao rotulo="Saldo do mês" valor={moeda(m.saldoDoMes)} tom={tomDoSaldo(m.saldoDoMes)} />
            </dl>
            </Cartao>
          </li>
        ))}
      </ul>
    <div className="hidden md:block c41-tabela overflow-x-auto border border-border rounded-lg bg-surface">
      {/* Sem a coluna das barrinhas desde 08/10/2026: o gráfico acima faz o
          papel delas. Entrada zerada fica em cinza, como o saldo zerado. */}
      <table className="w-full min-w-[600px] text-ui">
        <thead>
          <tr className={CABECALHO}>
            <th className="py-2 pl-4 pr-3 font-medium">Mês</th>
            <th className="py-2 pr-3 font-medium text-right">Entradas</th>
            <th className="py-2 pr-3 font-medium text-right">Saídas</th>
            <th className="py-2 pr-3 font-medium text-right">Saldo do mês</th>
            <th className="py-2 pr-4 font-medium text-right">Acumulado</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.competencia} className="border-b border-border-soft">
              <td className="py-2 pl-4 pr-3 font-medium">{m.rotulo}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${m.entradas === 0 ? "text-fg-muted" : ""}`}>{moeda(m.entradas)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${m.saidas === 0 ? "text-fg-muted" : ""}`}>{moeda(m.saidas)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${tomDoSaldo(m.saldoDoMes)}`}>{moeda(m.saldoDoMes)}</td>
              <td className={`py-2 pr-4 text-right tabular-nums font-medium ${tomDoSaldo(m.saldoAcumulado)}`}>{moeda(m.saldoAcumulado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

/** Rótulo em cima e valor embaixo — os cartões que fazem as vezes da tabela no celular. */
function ParNoCartao({ rotulo, valor, tom = "text-fg" }: { rotulo: string; valor: React.ReactNode; tom?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro text-fg-muted">{rotulo}</dt>
      <dd className={`text-fs-2 tabular-nums ${tom}`}>{valor}</dd>
    </div>
  );
}

/**
 * Com saldo bancário, cada janela mostra também o **saldo projetado**: o das
 * contas mais os títulos até o fim dela. Sem saldo, fica só o resultado dos
 * títulos, como antes — somar zero seria afirmar um saldo que não se conhece.
 *
 * O valor em 18px (`text-section`) desde 08/10/2026: era 16, fora dos papéis
 * da escala. Compacto de propósito — são seis janelas lado a lado, com duas
 * linhas de apoio cada, o que a `FaixaDeTotais` não comporta.
 */
export function CartoesDaProjecao({ projecao, saldoInicial = null }: { projecao: Projecao; saldoInicial?: number | null }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {projecao.janelas.map((j) => (
          <Card key={j.dias} className="p-3">
            <p className="text-micro text-fg-muted">Até {j.dias} dias</p>
            <p className={`text-section font-semibold tabular-nums mt-0.5 ${tomDoSaldo(j.saldo)}`}>{moeda(j.saldo)}</p>
            <p className="text-micro text-fg-muted tabular-nums">
              +{moeda(j.entradas)} / −{moeda(j.saidas)}
            </p>
            {saldoInicial !== null && (
              <p className="text-micro tabular-nums mt-1 text-fg-muted">
                Saldo projetado: <span className={tomDoSaldo(saldoInicial + j.saldo)}>{moeda(saldoInicial + j.saldo)}</span>
              </p>
            )}
          </Card>
        ))}
      </div>
      {(projecao.vencidos.entradas > 0 || projecao.vencidos.saidas > 0) && (
        <p className="text-helper text-warning-fg mt-3">
          Fora das janelas: {moeda(projecao.vencidos.entradas)} a receber e {moeda(projecao.vencidos.saidas)} a pagar já
          vencidos e não baixados.
        </p>
      )}
    </>
  );
}

/**
 * O saldo das contas bancárias do escopo, vindo da conciliação. O número em
 * 22px (`text-title`), o do valor da `FaixaDeTotais` (08/10/2026): era 20,
 * fora da escala.
 */
export function QuadroDoSaldoBancario({ saldo }: { saldo: SaldoConsolidado }) {
  const dataCurta = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
  if (saldo.contas.length === 0) {
    return (
      // Revisão de 05/10: botão não é link — o destino era texto azul no meio da frase.
      <Card className="p-4 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fs-2 text-fg-muted">
        <p>Nenhuma conta bancária ativa. Cadastre a conta e importe o extrato na Conciliação bancária para o fluxo mostrar o saldo real.</p>
        <Button href="/conciliacao" variant="secondary" size="xs">
          Abrir conciliação bancária
        </Button>
      </Card>
    );
  }
  return (
    <Card className="p-4 mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-helper text-fg-muted">Saldo das contas</p>
        {saldo.atualizadoAteKey && <p className="text-micro text-fg-muted">extrato até {dataCurta(saldo.atualizadoAteKey)}</p>}
      </div>
      <p className={`text-title font-semibold tabular-nums ${saldo.centavos === null ? "text-fg-muted" : tomDoSaldo(saldo.centavos)}`}>
        {saldo.centavos === null ? "—" : moeda(saldo.centavos)}
      </p>
      <ul className="mt-2 flex flex-col gap-0.5">
        {saldo.contas.map((c) => (
          <li key={c.id} className="flex items-baseline justify-between gap-2 text-fs-2">
            <span className="text-fg-secondary truncate">{c.nome}</span>
            <span className="tabular-nums">
              {c.saldo.centavos === null ? <span className="text-fg-muted">sem saldo</span> : moeda(c.saldo.centavos)}
              {c.saldo.origem === "banco" && <span className="text-fg-muted"> (do banco)</span>}
            </span>
          </li>
        ))}
      </ul>
      {(saldo.contasSemSaldo > 0 || saldo.contasDivergentes > 0) && (
        <p className="text-micro text-warning-fg mt-2">
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
    <>
      {/* No celular, um cartão por empresa — ver `TabelaDoRealizado`. */}
      <ul className="md:hidden flex flex-col gap-2">
        {linhas.map((l) => (
          <li key={l.companyId}>
            <Cartao>
            <p className="font-medium text-fg">{nomes.get(l.companyId) ?? "—"}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <ParNoCartao rotulo="Pago no mês" valor={moeda(l.pago)} />
              <ParNoCartao rotulo="Recebido" valor={moeda(l.recebido)} />
              <ParNoCartao rotulo="Saldo" valor={moeda(l.saldo)} tom={tomDoSaldo(l.saldo)} />
              <ParNoCartao rotulo="Vencidas a pagar" valor={vencidas(l.companyId, l.vencidasPagar, "/pagar")} />
              <ParNoCartao rotulo="Vencidas a receber" valor={vencidas(l.companyId, l.vencidasReceber, "/receber")} />
            </dl>
            </Cartao>
          </li>
        ))}
      </ul>
    <div className="hidden md:block c41-tabela overflow-x-auto border border-border rounded-lg bg-surface">
      <table className="w-full min-w-[760px] text-ui">
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
              <td className={`py-2 pr-3 text-right tabular-nums ${tomDoSaldo(l.saldo)}`}>{moeda(l.saldo)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{vencidas(l.companyId, l.vencidasPagar, "/pagar")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{vencidas(l.companyId, l.vencidasReceber, "/receber")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
