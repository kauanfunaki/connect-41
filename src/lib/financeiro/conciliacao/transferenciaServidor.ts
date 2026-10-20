// A categoria de transferência no banco — da conciliação (19/10) e do
// adiantamento (lote D, 20/10). A regra de qual categoria serve mora em
// `transferencia.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { TRANSFERENCIA } from "@/lib/dre/estrutura";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { escolherCategoriaDeTransferencia, NOME_DA_CATEGORIA_DE_TRANSFERENCIA } from "./transferencia";

/**
 * A categoria de transferência do tipo, na empresa. O plano padrão da 41 só tem
 * a de saída; a de entrada nasce no padrão do escritório, com o mesmo nome e
 * fora da DRE, na primeira transferência que precisar dela.
 */
export async function categoriaDeTransferencia(
  tx: Prisma.TransactionClient,
  tenantId: string,
  companyId: string,
  kind: "PAGAR" | "RECEBER"
): Promise<string> {
  const candidatas = await tx.financeCategory.findMany({
    where: ondeDaEmpresa(tenantId, companyId, { kind, apenasAtivas: false, incluirOcultas: true }),
    select: { id: true, name: true, companyId: true, active: true },
  });
  const achada = escolherCategoriaDeTransferencia(candidatas);
  if (achada) return achada.id;
  const criada = await tx.financeCategory.create({
    data: { tenantId, scope: "", name: NOME_DA_CATEGORIA_DE_TRANSFERENCIA, kind, dreGroup: TRANSFERENCIA },
    select: { id: true },
  });
  return criada.id;
}
