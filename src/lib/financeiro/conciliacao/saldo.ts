// Saldo da conta bancária: o que o sistema calcula a partir do extrato
// importado, contra o que o banco diz ter. Função pura.
//
// A divergência é o alarme de que falta extrato: um período que não foi
// importado, um arquivo de outro dia, uma transação que o banco estornou e
// reexportou com outro FITID. Com saldo inicial certo e todos os extratos
// dentro, a divergência é zero no centavo.

export type TransacaoDoSaldo = {
  /** "AAAA-MM-DD". */
  dataKey: string;
  /** Com sinal. Ignoradas entram: o dinheiro passou pela conta. */
  centavos: number;
};

export type EntradaDoSaldo = {
  saldoInicialCentavos: number | null;
  /** Saldo no início deste dia, antes das transações dele. */
  saldoInicialKey: string | null;
  transacoes: TransacaoDoSaldo[];
  /** O LEDGERBAL da importação mais recente, se houver. */
  banco: { centavos: number; dataKey: string | null } | null;
};

export type SituacaoDoSaldo =
  | { tipo: "sem_dados" }
  /** Tem o saldo do banco, mas nada com que comparar. */
  | { tipo: "sem_saldo_inicial"; bancoCentavos: number; bancoDataKey: string | null }
  /** Tem saldo inicial, mas nenhuma importação trouxe saldo do banco. */
  | { tipo: "sem_saldo_do_banco"; calculadoCentavos: number }
  /** O saldo do banco é de antes do saldo inicial — não há período para somar. */
  | { tipo: "banco_anterior_ao_inicial"; calculadoCentavos: number; bancoCentavos: number; bancoDataKey: string }
  | {
      tipo: "conferido";
      /** Saldo calculado **na data do saldo do banco**, para comparar o mesmo instante. */
      calculadoNaDataCentavos: number;
      calculadoCentavos: number;
      bancoCentavos: number;
      bancoDataKey: string | null;
      /** Calculado menos banco. Zero é conciliado. */
      divergenciaCentavos: number;
    };

/**
 * A situação do saldo de uma conta.
 *
 * `calculadoCentavos` é o saldo inicial mais **todas** as transações a partir
 * da data dele — o saldo "de agora" pelo que foi importado. A comparação com o
 * banco, porém, usa só as transações até a data do saldo do banco
 * (`DTASOF`): extrato mais novo importado depois não deve virar divergência de
 * um saldo mais antigo. Sem `DTASOF`, compara com tudo.
 */
export function situacaoDoSaldo(e: EntradaDoSaldo): SituacaoDoSaldo {
  const temInicial = e.saldoInicialCentavos !== null && e.saldoInicialKey !== null;

  if (!temInicial) {
    if (!e.banco) return { tipo: "sem_dados" };
    return { tipo: "sem_saldo_inicial", bancoCentavos: e.banco.centavos, bancoDataKey: e.banco.dataKey };
  }

  const inicioKey = e.saldoInicialKey!;
  let calculado = e.saldoInicialCentavos!;
  let naData = e.saldoInicialCentavos!;
  const corte = e.banco?.dataKey ?? null;
  for (const t of e.transacoes) {
    if (t.dataKey < inicioKey) continue;
    calculado += t.centavos;
    if (corte === null || t.dataKey <= corte) naData += t.centavos;
  }

  if (!e.banco) return { tipo: "sem_saldo_do_banco", calculadoCentavos: calculado };
  if (corte !== null && corte < inicioKey) {
    return { tipo: "banco_anterior_ao_inicial", calculadoCentavos: calculado, bancoCentavos: e.banco.centavos, bancoDataKey: corte };
  }
  return {
    tipo: "conferido",
    calculadoNaDataCentavos: naData,
    calculadoCentavos: calculado,
    bancoCentavos: e.banco.centavos,
    bancoDataKey: corte,
    divergenciaCentavos: naData - e.banco.centavos,
  };
}

/**
 * Qual importação fornece o saldo do banco: a de `DTASOF` mais recente.
 *
 * Não a última **importada**: quem importa agosto depois de setembro para
 * completar um buraco não quer que o saldo de referência volte para agosto.
 * Empate (ou sem data) desempata pela importação mais nova.
 */
export function saldoDeReferencia<T extends { ledgerCentavos: number | null; ledgerKey: string | null; importadoEm: Date }>(
  importacoes: T[]
): T | null {
  let melhor: T | null = null;
  for (const i of importacoes) {
    if (i.ledgerCentavos === null) continue;
    if (!melhor) {
      melhor = i;
      continue;
    }
    const a = i.ledgerKey ?? "";
    const b = melhor.ledgerKey ?? "";
    if (a > b || (a === b && i.importadoEm > melhor.importadoEm)) melhor = i;
  }
  return melhor;
}
