// Mantém o status do acordo em dia com a baixa das parcelas.
//
// Chamado **dentro da transação** de quem mexe em `paidAt` de um lançamento —
// baixa manual, desfazer baixa, conciliar e desfazer conciliação —, e não por
// um cron: "cumprido" que só aparece no dia seguinte é uma tela de acordos que
// mente por um dia, e a volta de cumprido para ativo (baixa desfeita) precisa
// acontecer junto do desfazer.

import type { Prisma } from "@/generated/prisma/client";
import { statusSincronizado } from "./acordo";

/**
 * Recalcula o status dos acordos de que estes lançamentos são parcela.
 *
 * O `updateMany` é condicionado ao status lido: um "marcar como quebrado" que
 * aconteceu entre a leitura e aqui não é sobrescrito — o próximo movimento de
 * parcela recalcula a partir dele.
 */
export async function sincronizarAcordos(tx: Prisma.TransactionClient, tenantId: string, entryIds: string[]): Promise<void> {
  if (entryIds.length === 0) return;
  const parcelas = await tx.financeEntry.findMany({
    where: { tenantId, id: { in: entryIds }, agreementId: { not: null } },
    select: { agreementId: true },
    distinct: ["agreementId"],
  });
  const ids = parcelas.map((p) => p.agreementId!).filter(Boolean);
  if (ids.length === 0) return;

  const acordos = await tx.collectionAgreement.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, status: true, parcelas: { select: { status: true, closeReason: true, paidAt: true } } },
  });
  for (const a of acordos) {
    const novo = statusSincronizado(a.status, a.parcelas);
    if (novo === a.status) continue;
    await tx.collectionAgreement.updateMany({
      where: { id: a.id, tenantId, status: a.status },
      data: { status: novo, closedAt: novo === "CUMPRIDO" ? new Date() : null },
    });
  }
}
