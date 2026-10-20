// A leitura de caixa a partir das baixas (19/10, lote C). Os relatórios de
// caixa — fluxo realizado, DRE de caixa, consolidado — somavam as contas pagas
// no período; agora somam as baixas: a parcela paga em outubro entra em
// outubro, mesmo com a conta ainda em aberto, e juros, multa e desconto entram
// nas categorias deles (`movimentosDaBaixa`).
//
// As contas pagas antes de 19/10 ganharam uma baixa cheia na migration, no dia
// e no valor de antes: para elas, nada muda nos números.
//
// Conta com rateio (lote D, 20/10): o principal de cada baixa vai para as
// linhas, na proporção delas — a baixa cheia dá exatamente o valor de cada
// linha. Juros, multa e desconto seguem nas categorias deles, com o centro e o
// projeto da conta.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { centavosDeDecimal } from "../contas";
import { movimentosDaBaixa, type MovimentoDaBaixa } from "./regras";
import { partesDoRateio } from "../rateio";

export type MovimentoDeCaixa = MovimentoDaBaixa & {
  /** O instante da baixa — o mês de caixa sai dele. */
  paidAt: Date;
  /** A baixa de onde saiu — a conta rateada dá um principal por linha, todos da mesma baixa. */
  paymentId: string;
  entryId: string;
  companyId: string;
  /** A contraparte da conta — a tabela dinâmica abre o caixa por fornecedor e cliente. */
  counterpartyId: string;
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
      id: true,
      paidAt: true,
      principal: true,
      interest: true,
      fine: true,
      discount: true,
      interestCategoryId: true,
      discountCategoryId: true,
      entry: {
        select: {
          id: true,
          kind: true,
          categoryId: true,
          companyId: true,
          counterpartyId: true,
          costCenterId: true,
          projectId: true,
          competence: true,
          agreementId: true,
          dueDate: true,
          allocations: { select: { categoryId: true, costCenterId: true, projectId: true, amount: true }, orderBy: { position: "asc" } },
        },
      },
    },
  });
  return baixas.flatMap((b) => {
    const base = {
      paidAt: b.paidAt,
      paymentId: b.id,
      entryId: b.entry.id,
      companyId: b.entry.companyId,
      counterpartyId: b.entry.counterpartyId,
      competence: b.entry.competence,
      agreementId: b.entry.agreementId,
      dueDate: b.entry.dueDate,
    };
    const rateio = b.entry.allocations.map((a) => ({ ...a, centavos: centavosDeDecimal(a.amount) }));
    return movimentosDaBaixa({
      kind: b.entry.kind,
      categoryId: b.entry.categoryId,
      principalCentavos: centavosDeDecimal(b.principal),
      jurosCentavos: centavosDeDecimal(b.interest),
      multaCentavos: centavosDeDecimal(b.fine),
      descontoCentavos: centavosDeDecimal(b.discount),
      interestCategoryId: b.interestCategoryId,
      discountCategoryId: b.discountCategoryId,
    }).flatMap((m): MovimentoDeCaixa[] => {
      if (m.parte === "principal" && rateio.length > 1) {
        const partes = partesDoRateio(m.centavos, rateio).filter((p) => p.centavos !== 0);
        return partes.map(({ linha, centavos }) => ({
          ...m,
          ...base,
          centavos,
          categoryId: linha.categoryId,
          costCenterId: linha.costCenterId,
          projectId: linha.projectId,
        }));
      }
      // Juros e desconto não têm centro nem projeto próprios: são da conta.
      return [{ ...m, ...base, costCenterId: b.entry.costCenterId, projectId: b.entry.projectId }];
    });
  });
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
