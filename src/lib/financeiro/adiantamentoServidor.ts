// O adiantamento no banco (lote D, 20/10): a conta de adiantamento da empresa,
// os saldos de cada fornecedor (ou cliente) e os adiantamentos lançados. As
// regras moram em `adiantamento.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "./contas";
import { BANCO_DO_ADIANTAMENTO, CONTA_DE_ADIANTAMENTO, saldosDoAdiantamento, sinalNoAdiantamento, type SaldoDoAdiantamento, type TipoDeAdiantamento } from "./adiantamento";

type Tx = Prisma.TransactionClient;
type Cliente = Tx | ReturnType<typeof getPrisma>;

/**
 * A conta de adiantamento da empresa, criada na primeira vez que se adianta.
 * Uma de cada tipo por empresa — o banco 000 e o número dela no unique.
 * Inativa volta a ativa: o adiantamento novo é de quem a usa.
 */
export async function contaDeAdiantamento(tx: Tx, tenantId: string, companyId: string, tipo: TipoDeAdiantamento): Promise<string> {
  const ja = await tx.bankAccount.findFirst({ where: { tenantId, companyId, type: tipo }, select: { id: true, active: true }, orderBy: { createdAt: "asc" } });
  if (ja) {
    if (!ja.active) await tx.bankAccount.update({ where: { id: ja.id }, data: { active: true } });
    return ja.id;
  }
  const c = CONTA_DE_ADIANTAMENTO[tipo];
  const criada = await tx.bankAccount.create({
    data: { tenantId, companyId, nickname: c.apelido, bankCode: BANCO_DO_ADIANTAMENTO, accountNumber: c.numero, accountDigits: c.digitos, type: tipo },
    select: { id: true },
  });
  return criada.id;
}

/** As baixas que passaram pela conta de adiantamento da empresa, das contas que valem. */
async function movimentos(cliente: Cliente, tenantId: string, companyId: string, tipo: TipoDeAdiantamento, contraparteId?: string) {
  return cliente.financeEntryPayment.findMany({
    where: {
      tenantId,
      companyId,
      bankAccount: { type: tipo },
      entry: { status: { not: "CANCELADO" }, ...(contraparteId ? { counterpartyId: contraparteId } : {}) },
    },
    select: { cash: true, entry: { select: { kind: true, counterpartyId: true, counterparty: { select: { name: true } } } } },
  });
}

/** O disponível de cada fornecedor (ou cliente) na empresa — só quem tem saldo. */
export async function saldosDeAdiantamento(cliente: Cliente, tenantId: string, companyId: string, tipo: TipoDeAdiantamento): Promise<SaldoDoAdiantamento[]> {
  const linhas = await movimentos(cliente, tenantId, companyId, tipo);
  return saldosDoAdiantamento(
    tipo,
    linhas.map((l) => ({ contraparteId: l.entry.counterpartyId, contraparteNome: l.entry.counterparty.name, kind: l.entry.kind, centavos: centavosDeDecimal(l.cash) }))
  );
}

/** O disponível de um fornecedor (ou cliente). Dentro da transação da baixa, lê o estado dela. */
export async function disponivelDoAdiantamento(cliente: Cliente, tenantId: string, companyId: string, tipo: TipoDeAdiantamento, contraparteId: string): Promise<number> {
  const linhas = await movimentos(cliente, tenantId, companyId, tipo, contraparteId);
  return linhas.reduce((s, l) => s + sinalNoAdiantamento(tipo, l.entry.kind) * centavosDeDecimal(l.cash), 0);
}

export type AdiantamentoLancado = {
  transferId: string;
  contraparteNome: string;
  dataKey: string;
  centavos: number;
  /** A conta do banco de onde saiu (ou onde entrou). */
  contaDoBanco: string | null;
  /** A ponta do banco já casou com a linha do extrato: desfazer é na conciliação. */
  conciliado: boolean;
};

/**
 * Os adiantamentos lançados na empresa, do mais recente — as pontas da
 * transferência que entraram na conta de adiantamento, com a ponta do banco
 * ao lado. É a lista de onde se desfaz um lançado por engano.
 */
export async function adiantamentosLancados(cliente: Cliente, tenantId: string, companyId: string, tipo: TipoDeAdiantamento, limite = 30): Promise<AdiantamentoLancado[]> {
  const entra = tipo === "ADIANTAMENTO_FORNECEDOR" ? "RECEBER" : "PAGAR";
  const pontas = await cliente.financeEntry.findMany({
    where: { tenantId, companyId, kind: entra, status: { not: "CANCELADO" }, transferId: { not: null }, payments: { some: { bankAccount: { type: tipo } } } },
    select: { transferId: true, amount: true, paidAt: true, counterparty: { select: { name: true } } },
    orderBy: { paidAt: "desc" },
    take: limite,
  });
  const ids = pontas.map((p) => p.transferId!);
  const doBanco = ids.length
    ? await cliente.financeEntry.findMany({
        where: { tenantId, companyId, transferId: { in: ids }, kind: entra === "RECEBER" ? "PAGAR" : "RECEBER" },
        select: { transferId: true, payments: { select: { bankMatch: { select: { id: true } }, bankAccount: { select: { nickname: true, accountNumber: true } } } } },
      })
    : [];
  const porTransferencia = new Map(doBanco.map((b) => [b.transferId!, b]));
  return pontas.map((p) => {
    const b = porTransferencia.get(p.transferId!);
    const baixa = b?.payments[0];
    return {
      transferId: p.transferId!,
      contraparteNome: p.counterparty.name,
      dataKey: p.paidAt ? saoPauloParts(p.paidAt).dateKey : "",
      centavos: centavosDeDecimal(p.amount),
      contaDoBanco: baixa?.bankAccount ? `${baixa.bankAccount.nickname} ${baixa.bankAccount.accountNumber}` : null,
      conciliado: Boolean(baixa?.bankMatch),
    };
  });
}
