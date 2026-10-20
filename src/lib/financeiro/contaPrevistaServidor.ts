// A conta corrente prevista do título no banco (lote D, 20/10). As regras
// moram em `contaPrevista.ts`.

import { getPrisma } from "@/lib/prisma";
import { contaPrevistaDoLancamento, nomeDaContaBancaria, type ContaBancaria } from "./contaPrevista";

/**
 * As contas bancárias ativas da empresa, para os seletores. A `atualId` entra
 * mesmo inativa: abrir a edição para mudar a descrição não pode obrigar a
 * trocar uma conta que foi desativada depois.
 */
export async function contasBancariasDaEmpresa(tenantId: string, companyId: string, atualId?: string | null): Promise<ContaBancaria[]> {
  const contas = await getPrisma().bankAccount.findMany({
    where: { tenantId, companyId, OR: [{ active: true }, ...(atualId ? [{ id: atualId }] : [])] },
    select: { id: true, nickname: true, accountNumber: true, active: true },
    orderBy: { nickname: "asc" },
  });
  return contas.map((c) => ({ id: c.id, nome: c.active ? nomeDaContaBancaria(c) : `${nomeDaContaBancaria(c)} (inativa)` }));
}

/** A conta prevista informada num lançamento, conferida no banco — com `tenantId` no `where`. */
export async function contaPrevistaInformada(p: {
  tenantId: string;
  companyId: string;
  informadoId: string | null;
  atualId?: string | null;
}): Promise<{ ok: true; contaId: string | null } | { ok: false; erro: string }> {
  const conta = p.informadoId
    ? await getPrisma().bankAccount.findFirst({
        where: { id: p.informadoId, tenantId: p.tenantId },
        select: { id: true, companyId: true, active: true },
      })
    : null;
  return contaPrevistaDoLancamento({ companyId: p.companyId, informadoId: p.informadoId, conta, atualId: p.atualId });
}
