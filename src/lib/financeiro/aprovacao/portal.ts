// O que o cliente vê das aprovações: as contas aguardando nas empresas do
// alcance dele, com o teto dele em cada uma.

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import type { EscopoFinanceiro } from "@/lib/financeiro/consultas";
import { dentroDoTeto } from "./regras";
import { whereDaAlcadaValida } from "./servidor";

const LIMITE = 500;

export async function aprovacoesDoCliente(escopo: EscopoFinanceiro, portalUserId: string) {
  const companyIds = escopo.companyIds ?? [];
  const prisma = getPrisma();
  const [contas, alcadas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: {
        tenantId: escopo.tenantId,
        companyId: { in: companyIds },
        kind: "PAGAR",
        approvalStatus: "AGUARDANDO",
        status: { not: "CANCELADO" },
      },
      select: {
        id: true,
        amount: true,
        dueDate: true,
        description: true,
        companyId: true,
        counterparty: { select: { name: true } },
        company: { select: { name: true, displayName: true } },
      },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: LIMITE,
    }),
    prisma.portalApprovalLimit.findMany({
      where: { ...whereDaAlcadaValida(escopo.tenantId), portalUserId, companyId: { in: companyIds } },
      select: { companyId: true, maxAmount: true },
    }),
  ]);
  const teto = new Map(alcadas.map((a) => [a.companyId, centavosDeDecimal(a.maxAmount)]));
  return {
    temAlcada: alcadas.length > 0,
    contas: contas.map((c) => {
      const valorCentavos = centavosDeDecimal(c.amount);
      return {
        id: c.id,
        fornecedor: c.counterparty.name,
        descricao: c.description,
        empresa: nomeExibicao(c.company),
        vencimento: c.dueDate,
        valorCentavos,
        dentroDoTeto: dentroDoTeto(teto.get(c.companyId) ?? null, valorCentavos),
      };
    }),
  };
}
