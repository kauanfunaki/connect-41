// Tira da fila de conciliação as linhas do extrato que o BPO já conciliou no
// Omie. A regra de quem casa com quem está em `omie.ts`; aqui é a leitura e a
// gravação.
//
// Roda no fim da leitura das contas do Omie e depois de cada importação de OFX
// numa conta ligada ao Omie — as duas pontas podem chegar em qualquer ordem.
//
// Não mexe no lançamento: ele já está pago como o Omie diz, e o Omie é a
// fonte. O vínculo guarda o estado atual como "antes", então desfazer devolve
// a linha à fila sem alterar o lançamento — e marca a linha para a próxima
// leitura não a casar sozinha de novo.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { parearPeloOmie } from "./omie";

/** Quantas linhas do extrato da conta foram conciliadas agora. */
export async function conciliarContaPeloOmie(tenantId: string, bankAccountId: string): Promise<number> {
  const prisma = getPrisma();
  const conta = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, tenantId },
    select: { id: true, companyId: true, omieAccountId: true },
  });
  if (!conta?.omieAccountId) return 0;

  const transacoes = await prisma.bankTransaction.findMany({
    where: { tenantId, bankAccountId: conta.id, status: "PENDENTE", omieAutoSkip: false },
    select: { id: true, amount: true, postedAt: true },
    take: 5_000,
  });
  if (transacoes.length === 0) return 0;

  const lancamentos = await prisma.financeEntry.findMany({
    where: {
      tenantId,
      companyId: conta.companyId,
      omieAccountId: conta.omieAccountId,
      omieReconciledAt: { not: null },
      status: "PAGO",
      paidAt: { not: null },
      bankMatch: { is: null },
    },
    select: { id: true, kind: true, status: true, amount: true, paidAt: true, omiePaidAmount: true },
  });

  const pares = parearPeloOmie(
    transacoes.map((t) => ({ id: t.id, centavos: centavosDeDecimal(t.amount), dataKey: saoPauloParts(t.postedAt).dateKey })),
    lancamentos.map((l) => ({
      id: l.id,
      kind: l.kind,
      centavos: centavosDeDecimal(l.omiePaidAmount ?? l.amount),
      pagoEmKey: saoPauloParts(l.paidAt!).dateKey,
    }))
  );
  const porId = new Map(lancamentos.map((l) => [l.id, l]));

  let feitas = 0;
  for (const p of pares) {
    const l = porId.get(p.lancamentoId)!;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.bankTransactionMatch.create({
          data: {
            transactionId: p.transacaoId,
            financeEntryId: l.id,
            amount: l.amount,
            entryStatusBefore: l.status,
            entryPaidAtBefore: l.paidAt,
          },
        });
        const marcada = await tx.bankTransaction.updateMany({
          where: { id: p.transacaoId, status: "PENDENTE", omieAutoSkip: false },
          data: { status: "CONCILIADA", reconciledAt: new Date(), reconciledById: null, reconciledViaOmie: true },
        });
        // Alguém conciliou à mão no meio do caminho: a dele vale.
        if (marcada.count !== 1) throw new Error("corrida");
      });
      feitas++;
    } catch {
      // Unique do vínculo (o lançamento acabou de ser conciliado por outra
      // linha) ou corrida no status: fica para gente, sem erro.
    }
  }

  // Sem auditoria por linha: quem registra é a execução da integração (contador
  // `extrato_conciliado_pelo_omie`) ou o resumo da importação do OFX.
  return feitas;
}

/** Todas as contas da empresa ligadas ao Omie. */
export async function conciliarEmpresaPeloOmie(tenantId: string, companyId: string): Promise<number> {
  const contas = await getPrisma().bankAccount.findMany({
    where: { tenantId, companyId, omieAccountId: { not: null } },
    select: { id: true },
  });
  let total = 0;
  for (const c of contas) total += await conciliarContaPeloOmie(tenantId, c.id);
  return total;
}
