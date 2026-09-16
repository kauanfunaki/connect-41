// O saldo das contas bancárias levado para fora da conciliação — fluxo de
// caixa, runway e CFO. Função pura.
//
// ─── Qual número é "o saldo de agora" de uma conta ──────────────────────────
//
// Com saldo inicial, é o calculado: saldo inicial mais tudo o que foi importado
// depois dele — inclusive extrato mais novo que o último saldo do banco. Sem
// saldo inicial, o único número que existe é o do banco, na data dele. Sem
// nenhum dos dois, a conta **fica de fora e é contada**, para a tela dizer que o
// total não inclui todas as contas em vez de mostrar um total menor sem aviso.
//
// ─── "Atualizado até" é o da conta mais atrasada ────────────────────────────
//
// Um total de três contas em que uma parou de ser importada há um mês é um
// total de um mês atrás para aquela parte. A data que acompanha o total é a
// mais antiga entre as contas que entraram nele — é a que diz o quanto dá para
// confiar.

import type { SituacaoDoSaldo } from "./saldo";

export type OrigemDoSaldo = "calculado" | "banco";

export type SaldoAtualDaConta = {
  centavos: number | null;
  origem: OrigemDoSaldo | null;
  /** Até quando o número vale: última movimentação importada, ou a data do saldo do banco. */
  referenciaKey: string | null;
  /** Calculado menos banco, quando os dois existem. */
  divergenciaCentavos: number | null;
};

export function saldoAtualDaConta(situacao: SituacaoDoSaldo, ultimaMovimentacaoKey: string | null): SaldoAtualDaConta {
  switch (situacao.tipo) {
    case "sem_dados":
      return { centavos: null, origem: null, referenciaKey: null, divergenciaCentavos: null };
    case "sem_saldo_inicial":
      return { centavos: situacao.bancoCentavos, origem: "banco", referenciaKey: situacao.bancoDataKey, divergenciaCentavos: null };
    case "sem_saldo_do_banco":
    case "banco_anterior_ao_inicial":
      return { centavos: situacao.calculadoCentavos, origem: "calculado", referenciaKey: ultimaMovimentacaoKey, divergenciaCentavos: null };
    case "conferido":
      return {
        centavos: situacao.calculadoCentavos,
        origem: "calculado",
        referenciaKey: maiorKey(ultimaMovimentacaoKey, situacao.bancoDataKey),
        divergenciaCentavos: situacao.divergenciaCentavos,
      };
  }
}

function maiorKey(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export type ContaParaConsolidar = { id: string; nome: string; saldo: SaldoAtualDaConta };

export type SaldoConsolidado = {
  /** Soma das contas com saldo. `null` quando nenhuma tem. */
  centavos: number | null;
  contas: ContaParaConsolidar[];
  /** Contas ativas que ficaram de fora por não terem saldo nenhum. */
  contasSemSaldo: number;
  /** Contas cujo calculado não bate com o banco. */
  contasDivergentes: number;
  /** A data mais antiga entre as contas que entraram no total. */
  atualizadoAteKey: string | null;
};

export function consolidarSaldos(contas: ContaParaConsolidar[]): SaldoConsolidado {
  let centavos: number | null = null;
  let contasSemSaldo = 0;
  let contasDivergentes = 0;
  let atualizadoAteKey: string | null = null;

  for (const c of contas) {
    if (c.saldo.centavos === null) {
      contasSemSaldo += 1;
      continue;
    }
    centavos = (centavos ?? 0) + c.saldo.centavos;
    if (c.saldo.divergenciaCentavos !== null && c.saldo.divergenciaCentavos !== 0) contasDivergentes += 1;
    const key = c.saldo.referenciaKey;
    if (key && (atualizadoAteKey === null || key < atualizadoAteKey)) atualizadoAteKey = key;
  }

  return { centavos, contas, contasSemSaldo, contasDivergentes, atualizadoAteKey };
}

/**
 * Quantos dias o saldo sustenta o consumo médio de caixa.
 *
 * `variacaoMediaMensalCentavos` é a média de (recebido − pago) dos últimos
 * meses: negativa é consumo. Sem consumo (zero ou positiva) não há runway a
 * medir — o caixa não está acabando — e a função devolve `null`; quem chama diz
 * o motivo. Saldo já negativo ou zero é zero dia.
 */
export function runwayEmDias(saldoCentavos: number, variacaoMediaMensalCentavos: number): number | null {
  if (variacaoMediaMensalCentavos >= 0) return null;
  if (saldoCentavos <= 0) return 0;
  return Math.floor((saldoCentavos / -variacaoMediaMensalCentavos) * 30);
}
