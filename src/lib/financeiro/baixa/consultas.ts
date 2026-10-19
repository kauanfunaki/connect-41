// A leitura de caixa a partir das baixas (19/10, lote C). Os relatórios de
// caixa — fluxo realizado, DRE de caixa, consolidado — somavam as contas pagas
// no período; agora somam as baixas: a parcela paga em outubro entra em
// outubro, mesmo com a conta ainda em aberto, e juros, multa e desconto entram
// nas categorias deles (`movimentosDaBaixa`).
//
// As contas pagas antes de 19/10 ganharam uma baixa cheia na migration, no dia
// e no valor de antes: para elas, nada muda nos números.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { centavosDeDecimal } from "../contas";
import { movimentosDaBaixa, type MovimentoDaBaixa } from "./regras";

export type MovimentoDeCaixa = MovimentoDaBaixa & {
  /** O instante da baixa — o mês de caixa sai dele. */
  paidAt: Date;
  entryId: string;
  companyId: string;
  costCenterId: string | null;
  projectId: string | null;
  /** A competência da conta (a DRE econômica e a reconciliação usam). */
  competence: string;
  agreementId: string | null;
  dueDate: Date;
};

/**
 * Os movimentos de caixa das baixas que passam no filtro. Conta cancelada fica
 * de fora — nenhum caminho cancela conta com baixa, e se uma escapou, o
 * cancelamento diz que ela não vale.
 */
export async function movimentosDeCaixa(where: Prisma.FinanceEntryPaymentWhereInput): Promise<MovimentoDeCaixa[]> {
  const baixas = await getPrisma().financeEntryPayment.findMany({
    where: { ...where, entry: { status: { not: "CANCELADO" } } },
    select: {
      paidAt: true,
      principal: true,
      interest: true,
      fine: true,
      discount: true,
      interestCategoryId: true,
      discountCategoryId: true,
      entry: {
        select: { id: true, kind: true, categoryId: true, companyId: true, costCenterId: true, projectId: true, competence: true, agreementId: true, dueDate: true },
      },
    },
  });
  return baixas.flatMap((b) =>
    movimentosDaBaixa({
      kind: b.entry.kind,
      categoryId: b.entry.categoryId,
      principalCentavos: centavosDeDecimal(b.principal),
      jurosCentavos: centavosDeDecimal(b.interest),
      multaCentavos: centavosDeDecimal(b.fine),
      descontoCentavos: centavosDeDecimal(b.discount),
      interestCategoryId: b.interestCategoryId,
      discountCategoryId: b.discountCategoryId,
    }).map((m) => ({
      ...m,
      paidAt: b.paidAt,
      entryId: b.entry.id,
      companyId: b.entry.companyId,
      // Juros e desconto não têm centro nem projeto próprios: são da conta.
      costCenterId: b.entry.costCenterId,
      projectId: b.entry.projectId,
      competence: b.entry.competence,
      agreementId: b.entry.agreementId,
      dueDate: b.entry.dueDate,
    }))
  );
}

/** O filtro de baixas de um período `[de, ate)` numa empresa ou num escopo. */
export function baixasNoPeriodo(
  escopo: { tenantId: string; companyId?: string; companyIds?: string[] | null },
  de: Date,
  ate: Date
): Prisma.FinanceEntryPaymentWhereInput {
  return {
    tenantId: escopo.tenantId,
    ...(escopo.companyId ? { companyId: escopo.companyId } : escopo.companyIds ? { companyId: { in: escopo.companyIds } } : {}),
    paidAt: { gte: de, lt: ate },
  };
}
