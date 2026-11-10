// A fila de /aprovacoes — o recorte, sem banco (10/11/2026).
//
// Morava dentro da tela. Saiu para cá quando a aba "Aprovações" das
// Solicitações ganhou o balão com a quantidade (pedido do Kauan: balão como
// nos Chamados): a tela e o balão leem o mesmo `where` e a mesma situação
// padrão, e o número da aba não tem como divergir do que a fila mostra.

import type { Prisma } from "@/generated/prisma/client";

/**
 * As situações do filtro da fila. Aguardando e reprovada travam a baixa;
 * aprovada sai da fila (aparece em `/pagar` com o selo) e cancelada sai de tudo.
 */
export const SITUACOES_DA_FILA = [
  { chave: "aguardando", rotulo: "Aguardando", status: ["AGUARDANDO"] },
  { chave: "reprovadas", rotulo: "Reprovadas", status: ["REPROVADO"] },
  { chave: "todas", rotulo: "Aguardando e reprovadas", status: ["AGUARDANDO", "REPROVADO"] },
] as const;

export type SituacaoDaFila = (typeof SITUACOES_DA_FILA)[number];

/** A que a fila abre sem `?situacao=`: as duas que travam a baixa. */
export const SITUACAO_PADRAO_DA_FILA: SituacaoDaFila = SITUACOES_DA_FILA[2];

/** A situação do `?situacao=` da URL; valor desconhecido cai na padrão. */
export function situacaoDaFila(chave: string | null | undefined): SituacaoDaFila {
  return SITUACOES_DA_FILA.find((s) => s.chave === chave) ?? SITUACAO_PADRAO_DA_FILA;
}

/** As contas a pagar não canceladas do escritório — ou só as da empresa da tela. */
export function whereDaFilaDeAprovacoes(tenantId: string, empresaId: string | null) {
  return {
    tenantId,
    kind: "PAGAR" as const,
    status: { not: "CANCELADO" as const },
    ...(empresaId ? { companyId: empresaId } : {}),
  } satisfies Prisma.FinanceEntryWhereInput;
}
