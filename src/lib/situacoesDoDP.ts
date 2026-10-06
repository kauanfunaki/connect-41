// O que conta como "em aberto" nos registros do DP — um lugar só para as
// telas, a Home e as ferramentas da IA (05/10/2026).
//
// Os recortes eram listas de situações "ativas" copiadas em cada lugar, e as
// listas esqueciam a situação inicial: o afastamento novo nasce "Lançado" e
// sumia de /afastamentos. Aqui é o contrário — lista-se o que FECHA, e todo o
// resto está em aberto, inclusive situação que vier a ser criada.

import type { AbsenceStatus, TerminationStatus } from "@/generated/prisma/enums";

/** Afastamento encerrado: reprovado ou concluído. O resto aparece em /afastamentos. */
export const AFASTAMENTO_ENCERRADO = ["REPROVADO", "CONCLUIDO"] as const satisfies readonly AbsenceStatus[];

/** Desligamento encerrado: finalizado ou cancelado. O resto está em andamento. */
export const DESLIGAMENTO_ENCERRADO = ["FINALIZADO", "CANCELADO"] as const satisfies readonly TerminationStatus[];

export function afastamentoEmAberto(status: AbsenceStatus): boolean {
  return !(AFASTAMENTO_ENCERRADO as readonly AbsenceStatus[]).includes(status);
}

export function desligamentoEmAndamento(status: TerminationStatus): boolean {
  return !(DESLIGAMENTO_ENCERRADO as readonly TerminationStatus[]).includes(status);
}

/**
 * Pode registrar um desligamento novo? Só não pode com um em andamento.
 *
 * Até 05/10/2026 o formulário só aparecia com todos os anteriores cancelados,
 * e um desligamento FINALIZADO travava a pessoa para sempre — quem é
 * recontratado e sai de novo não tinha como registrar a segunda saída.
 */
export function podeRegistrarDesligamento(anteriores: { status: TerminationStatus }[]): boolean {
  return !anteriores.some((t) => desligamentoEmAndamento(t.status));
}
