// O lançamento que nasce de uma linha do extrato, já pago e conciliado com
// ela. Era o miolo de `criarLancamentoDaTransacao`; saiu para cá quando as
// regras de conciliação (fila do BPO, 21/10) passaram a lançar do mesmo jeito.
// Roda dentro da transação de quem chama; a validação dos campos é de quem
// chama também.

import type { Prisma } from "@/generated/prisma/client";
import { instanteDaData } from "../periodo";
import { decimalDeCentavos } from "../manual";
import { quitarConta } from "../baixa/servidor";
import { gravarRateio } from "../rateioServidor";
import type { LinhaDoRateio } from "../rateio";

type Tx = Prisma.TransactionClient;

/** A linha já não está pendente: alguém conciliou ou ignorou no meio do caminho. */
export class RecusaDaLinha extends Error {}

export type LancamentoDaLinha = {
  tenantId: string;
  companyId: string;
  userId: string | null;
  transacao: { id: string; bankAccountId: string };
  /** O dia do extrato: vencimento e baixa. */
  dataKey: string;
  kind: "PAGAR" | "RECEBER";
  centavos: number;
  counterpartyId: string;
  categoryId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  competencia: string;
  descricao: string | null;
  /**
   * O rateio da conta (lote M1 do mercado, 23/10/2026), já conferido e
   * fechando `centavos`; com ele, categoria, centro e projeto são o resumo
   * das linhas. Ausente ou vazio: a conta numa categoria só.
   */
  rateio?: LinhaDoRateio[];
};

/**
 * Cria a conta, quita no dia do extrato pela conta bancária da linha, liga a
 * baixa à linha e marca a linha conciliada.
 *
 * Nasce `CONFERIDO` e pago, fora da aprovação por alçada (fica no padrão
 * NAO_REQUER): é o registro de um dinheiro que já andou. O vínculo guarda como
 * "antes" `CONFERIDO` sem baixa — desfazer a conciliação deixa a conta em
 * aberto, em vez de apagá-la.
 */
export async function lancarEConciliar(tx: Tx, l: LancamentoDaLinha): Promise<{ entryId: string }> {
  const pagoEm = instanteDaData(l.dataKey);
  const criado = await tx.financeEntry.create({
    data: {
      tenantId: l.tenantId,
      companyId: l.companyId,
      kind: l.kind,
      status: "CONFERIDO",
      counterpartyId: l.counterpartyId,
      categoryId: l.categoryId,
      costCenterId: l.costCenterId,
      projectId: l.projectId,
      competence: l.competencia,
      dueDate: pagoEm,
      amount: decimalDeCentavos(l.centavos),
      description: l.descricao,
      createdById: l.userId,
      reviewedById: l.userId,
      reviewedAt: new Date(),
    },
    select: { id: true, amount: true },
  });
  if (l.rateio && l.rateio.length > 0) await gravarRateio(tx, { tenantId: l.tenantId, entryId: criado.id, linhas: l.rateio });
  const baixa = await quitarConta(tx, {
    tenantId: l.tenantId,
    entryId: criado.id,
    paidAt: pagoEm,
    bankAccountId: l.transacao.bankAccountId,
    origin: "CONCILIACAO",
    userId: l.userId,
  });
  await tx.bankTransactionMatch.create({
    data: {
      transactionId: l.transacao.id,
      financeEntryId: criado.id,
      paymentId: baixa.paymentId,
      amount: criado.amount,
      entryStatusBefore: "CONFERIDO",
      entryPaidAtBefore: null,
      createdById: l.userId,
    },
  });
  const marcada = await tx.bankTransaction.updateMany({
    where: { id: l.transacao.id, status: "PENDENTE" },
    data: { status: "CONCILIADA", reconciledAt: new Date(), reconciledById: l.userId },
  });
  if (marcada.count !== 1) throw new RecusaDaLinha("Esta transação acabou de ser alterada por outra pessoa — atualize a tela.");
  return { entryId: criado.id };
}
