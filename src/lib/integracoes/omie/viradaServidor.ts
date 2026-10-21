// A leitura da virada (lote E) que as telas e as ações compartilham. A regra
// pura mora em `virada.ts`; aqui só a busca.

import { getPrisma } from "@/lib/prisma";
import { instanciaDoFinanceiro } from "./contas";

/**
 * A empresa ainda é lida do Omie: não virou, e a leitura do financeiro dela
 * está ligada. Enquanto for, o Omie é a fonte das contas — o Connect não cria
 * sozinho o que o BPO lança lá e a leitura traria de novo.
 */
export async function empresaLidaDoOmie(tenantId: string, companyId: string): Promise<boolean> {
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { omieCutoverAt: true } });
  if (!empresa || empresa.omieCutoverAt) return false;
  const leitura = await prisma.tenantIntegration.findFirst({
    where: { tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(companyId), enabled: true },
    select: { id: true },
  });
  return Boolean(leitura);
}
