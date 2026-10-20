// A virada da empresa do Omie para o Connect (lote E da fila do BPO, 20/10).
// Funções puras; a gravação é `virarParaOConnectAction`.
//
// Enquanto a leitura do financeiro de uma empresa está ligada, o Omie é a fonte
// das contas que vieram de lá: o que o BPO mudasse nelas no Connect voltaria ao
// do Omie na leitura seguinte (a cada 6 horas). Por isso, até a virada, a conta
// que veio do Omie é **dele**: no Connect não se edita o que a leitura reescreve,
// não se baixa, não se cancela, e a baixa que veio de lá não se desfaz.
//
// A virada é o momento de trocar a fonte: a última leitura roda até o fim, a do
// financeiro desliga, e a empresa ganha a data (`Company.omieCutoverAt`). Daí
// em diante a conta que veio do Omie é uma conta como as outras.

export type ContaComOrigem = { omieTitleId: string | null; omieMovementId: string | null };
export type EmpresaComVirada = { omieCutoverAt: Date | null };

/** Título ou movimento que veio do Omie. */
export function veioDoOmie(conta: ContaComOrigem): boolean {
  return conta.omieTitleId !== null || conta.omieMovementId !== null;
}

/** A conta que veio do Omie é dele até a empresa virar. */
export function presaAoOmie(conta: ContaComOrigem, empresa: EmpresaComVirada | null | undefined): boolean {
  return veioDoOmie(conta) && !empresa?.omieCutoverAt;
}

/** O porquê e o caminho de cada trava — a tela e o servidor dizem o mesmo. */
export const MOTIVO_DO_OMIE = {
  baixa: "Vem do Omie, e a empresa ainda é lida de lá — dê a baixa no Omie; a próxima leitura traz para cá.",
  cancelar: "Vem do Omie, e a empresa ainda é lida de lá — cancele no Omie; a próxima leitura traz para cá.",
  desfazerBaixa: "Esta baixa veio do Omie, e a empresa ainda é lida de lá — desfaça no Omie; a próxima leitura traz para cá.",
} as const;

export type EstadoDaVirada = {
  /** Já virou (a data), ou nula. */
  viradaEm: Date | null;
  /** A empresa já importou as contas do Omie alguma vez (tem a linha de progresso). */
  importouAsContas: boolean;
  /** A leitura do financeiro parou no meio — o cursor aponta a próxima página. */
  leituraPendente: boolean;
};

/**
 * Pode virar agora? Só depois da última leitura ter chegado ao fim: virar com
 * a leitura no meio deixaria no Connect uma parte das contas como estavam no
 * Omie e a outra como estavam semanas antes. Empresa que nunca importou as
 * contas vira sem leitura — não há conta do Omie para ficar presa.
 */
export function podeVirar(e: EstadoDaVirada): { pode: true } | { pode: false; motivo: string } {
  if (e.viradaEm) return { pode: false, motivo: "Esta empresa já virou para o Connect." };
  if (e.importouAsContas && e.leituraPendente) {
    return {
      pode: false,
      motivo:
        "A última leitura do Omie ainda não chegou ao fim — ela continua sozinha nas próximas rodadas. Tente a virada de novo depois.",
    };
  }
  return { pode: true };
}
