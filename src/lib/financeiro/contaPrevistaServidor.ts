// A conta corrente prevista do título no banco (lote D, 20/10). As regras
// moram em `contaPrevista.ts`.

import { getPrisma } from "@/lib/prisma";
import { contaPrevistaDoLancamento, nomeDaContaBancaria, type ContaBancaria } from "./contaPrevista";
import { TIPOS_DE_ADIANTAMENTO } from "./adiantamento";
import { ehCartaoDeCredito, TIPOS_FORA_DO_CAIXA } from "./tiposDeConta";

/**
 * As contas bancárias ativas da empresa, para os seletores. A `atualId` entra
 * mesmo inativa: abrir a edição para mudar a descrição não pode obrigar a
 * trocar uma conta que foi desativada depois.
 *
 * `comCartoes`: na conta a pagar, os cartões de crédito também (lote D, 20/10).
 */
export async function contasBancariasDaEmpresa(
  tenantId: string,
  companyId: string,
  atualId?: string | null,
  opcoes: { comCartoes?: boolean } = {}
): Promise<ContaBancaria[]> {
  const contas = await getPrisma().bankAccount.findMany({
    where: {
      tenantId,
      companyId,
      type: { notIn: opcoes.comCartoes ? [...TIPOS_DE_ADIANTAMENTO] : [...TIPOS_FORA_DO_CAIXA] },
      OR: [{ active: true }, ...(atualId ? [{ id: atualId }] : [])],
    },
    select: { id: true, nickname: true, accountNumber: true, active: true, type: true },
    orderBy: { nickname: "asc" },
  });
  return contas.map((c) => {
    const cartao = ehCartaoDeCredito(c.type);
    const nome = `${nomeDaContaBancaria(c)}${cartao ? " (cartão)" : ""}`;
    return { id: c.id, nome: c.active ? nome : `${nome} (inativa)`, ...(cartao ? { cartao } : {}) };
  });
}

/** A conta prevista informada num lançamento, conferida no banco — com `tenantId` no `where`. */
export async function contaPrevistaInformada(p: {
  tenantId: string;
  companyId: string;
  informadoId: string | null;
  atualId?: string | null;
  kind?: "PAGAR" | "RECEBER";
}): Promise<{ ok: true; contaId: string | null } | { ok: false; erro: string }> {
  const conta = p.informadoId
    ? await getPrisma().bankAccount.findFirst({
        where: { id: p.informadoId, tenantId: p.tenantId },
        select: { id: true, companyId: true, active: true, type: true },
      })
    : null;
  return contaPrevistaDoLancamento({ companyId: p.companyId, informadoId: p.informadoId, conta, atualId: p.atualId, kind: p.kind });
}
