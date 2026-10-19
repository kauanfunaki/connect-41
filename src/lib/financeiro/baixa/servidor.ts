// A gravação das baixas (19/10, lote C). Toda porta que paga ou desfaz um
// pagamento passa por aqui: o botão Pagar/Receber, o lançamento que já nasce
// pago, a importação, a conciliação, a transferência e a leitura do Omie.
//
// A regra é uma só, em `recalcularConta`: depois de qualquer mudança nas
// baixas, a conta é refeita a partir delas — `paidPrincipal` é a soma dos
// principais, e ela só fica PAGO (com `paidAt` na última baixa) quando o saldo
// zera. Assim nenhum caminho precisa saber o que os outros fazem com status e
// data, e a conta nunca diz uma coisa que as baixas desmentem.
//
// Funções de dentro de transação (`tx`): quem chama abre a transação, e um erro
// aqui desfaz junto o que o chamador gravou.

import type { Prisma } from "@/generated/prisma/client";
import { ondeDaEmpresa } from "../planoDeContas";
import { centavosDeDecimal } from "../contas";
import { decimalDeCentavos } from "../manual";
import { categoriaDaParte, ehCategoriaDaParte, estadoDaConta, saldoEmAberto, type ParteDaBaixa, type TipoDoLancamento } from "./regras";
import { saoPauloParts } from "@/lib/agenda";
import { motivoDoBloqueioDeBaixa } from "../aprovacao/regras";

type Tx = Prisma.TransactionClient;

/** Recusa de regra dentro da transação — vira mensagem para a tela. */
export class RecusaDaBaixa extends Error {}

export type OrigemDaBaixa = "MANUAL" | "LANCAMENTO" | "CONCILIACAO" | "TRANSFERENCIA" | "OMIE" | "MIGRACAO";

/**
 * Trava a linha da conta até o fim da transação. Duas baixas ao mesmo tempo na
 * mesma conta leriam o mesmo saldo e pagariam o título duas vezes; com a trava,
 * a segunda espera a primeira e lê o saldo já baixado.
 */
async function travarConta(tx: Tx, entryId: string) {
  await tx.$queryRaw`SELECT id FROM finance_entries WHERE id = ${entryId} FOR UPDATE`;
}

/**
 * A categoria de juros e multa, ou de desconto, para uma conta deste tipo na
 * empresa. A da empresa vence a do padrão, a ativa vence a inativa; sem
 * nenhuma, nasce no plano do escritório com a linha da DRE da regra.
 */
export async function categoriaDaBaixa(
  tx: Tx,
  tenantId: string,
  companyId: string,
  kindDaConta: TipoDoLancamento,
  parte: ParteDaBaixa
): Promise<string> {
  const alvo = categoriaDaParte(kindDaConta, parte);
  const candidatas = await tx.financeCategory.findMany({
    where: ondeDaEmpresa(tenantId, companyId, { kind: alvo.kind, apenasAtivas: false, incluirOcultas: true }),
    select: { id: true, name: true, companyId: true, active: true },
  });
  const achadas = candidatas
    .filter((c) => ehCategoriaDaParte(c.name, alvo))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(b.companyId !== null) - Number(a.companyId !== null));
  if (achadas[0]) return achadas[0].id;
  const criada = await tx.financeCategory.create({
    data: { tenantId, scope: "", name: alvo.nome, kind: alvo.kind, dreGroup: alvo.dreGroup },
    select: { id: true },
  });
  return criada.id;
}

/**
 * Refaz a conta a partir das baixas: o quanto foi baixado, se está paga e
 * desde quando. A data da conta paga é o instante da última baixa, como foi
 * gravado — a do Omie não é meio-dia, e normalizar aqui faria a leitura
 * seguinte do Omie ver uma mudança que não houve.
 */
export async function recalcularConta(tx: Tx, entryId: string): Promise<{ quitada: boolean; baixadoCentavos: number }> {
  const conta = await tx.financeEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: { amount: true, status: true, payments: { select: { principal: true, paidAt: true } } },
  });
  const estado = estadoDaConta(
    { valorCentavos: centavosDeDecimal(conta.amount), status: conta.status },
    conta.payments.map((p) => ({ principalCentavos: centavosDeDecimal(p.principal), dataKey: saoPauloParts(p.paidAt).dateKey }))
  );
  const ultima = estado.quitada ? conta.payments.reduce<Date | null>((m, p) => (m === null || p.paidAt > m ? p.paidAt : m), null) : null;
  await tx.financeEntry.update({
    where: { id: entryId },
    data: { paidPrincipal: decimalDeCentavos(estado.baixadoCentavos), status: estado.status, paidAt: ultima },
  });
  return { quitada: estado.quitada, baixadoCentavos: estado.baixadoCentavos };
}

export type NovaBaixa = {
  tenantId: string;
  entryId: string;
  paidAt: Date;
  principalCentavos: number;
  jurosCentavos?: number;
  multaCentavos?: number;
  descontoCentavos?: number;
  bankAccountId?: string | null;
  note?: string | null;
  origin: OrigemDaBaixa;
  userId?: string | null;
};

export type BaixaGravada = { paymentId: string; quitada: boolean; caixaCentavos: number; principal: Prisma.Decimal };

/**
 * Grava uma baixa e refaz a conta. Recusa principal acima do saldo **lido com
 * a conta travada** — a tela já conferiu, mas a conta pode ter mudado entre a
 * tela e aqui.
 */
export async function registrarBaixa(tx: Tx, b: NovaBaixa): Promise<BaixaGravada> {
  await travarConta(tx, b.entryId);
  const conta = await tx.financeEntry.findFirst({
    where: { id: b.entryId, tenantId: b.tenantId },
    select: { kind: true, amount: true, paidPrincipal: true, status: true, companyId: true, approvalStatus: true },
  });
  if (!conta) throw new RecusaDaBaixa("Lançamento não encontrado.");
  if (conta.status === "CANCELADO") throw new RecusaDaBaixa("Conta cancelada não recebe baixa.");
  // Aprovação por alçada, relida com a conta travada: aguardando ou reprovada
  // não sai do caixa por caminho nenhum — botão, conciliação, parcial.
  const bloqueio = motivoDoBloqueioDeBaixa(conta);
  if (bloqueio) throw new RecusaDaBaixa(bloqueio);
  const saldo = saldoEmAberto(centavosDeDecimal(conta.amount), centavosDeDecimal(conta.paidPrincipal));
  if (b.principalCentavos <= 0) throw new RecusaDaBaixa("O valor da baixa não pode ser zero.");
  if (b.principalCentavos > saldo) {
    throw new RecusaDaBaixa(saldo === 0 ? "Esta conta já está paga — atualize a tela." : "O valor da baixa passa do saldo em aberto — a conta acabou de mudar; atualize a tela.");
  }

  const juros = b.jurosCentavos ?? 0;
  const multa = b.multaCentavos ?? 0;
  const desconto = b.descontoCentavos ?? 0;
  const caixa = b.principalCentavos + juros + multa - desconto;
  if (juros < 0 || multa < 0 || desconto < 0 || caixa < 0) throw new RecusaDaBaixa("Juros, multa ou desconto inválido.");

  const interestCategoryId = juros + multa > 0 ? await categoriaDaBaixa(tx, b.tenantId, conta.companyId, conta.kind, "encargos") : null;
  const discountCategoryId = desconto > 0 ? await categoriaDaBaixa(tx, b.tenantId, conta.companyId, conta.kind, "desconto") : null;

  const criada = await tx.financeEntryPayment.create({
    data: {
      tenantId: b.tenantId,
      companyId: conta.companyId,
      entryId: b.entryId,
      paidAt: b.paidAt,
      principal: decimalDeCentavos(b.principalCentavos),
      interest: decimalDeCentavos(juros),
      fine: decimalDeCentavos(multa),
      discount: decimalDeCentavos(desconto),
      cash: decimalDeCentavos(caixa),
      interestCategoryId,
      discountCategoryId,
      bankAccountId: b.bankAccountId ?? null,
      note: b.note ?? null,
      origin: b.origin,
      createdById: b.userId ?? null,
    },
    select: { id: true, principal: true },
  });
  const { quitada } = await recalcularConta(tx, b.entryId);
  return { paymentId: criada.id, quitada, caixaCentavos: caixa, principal: criada.principal };
}

/** Quita o saldo inteiro de uma vez — a conciliação, o lançamento que nasce pago, a transferência. */
export async function quitarConta(tx: Tx, b: Omit<NovaBaixa, "principalCentavos">): Promise<BaixaGravada> {
  await travarConta(tx, b.entryId);
  const conta = await tx.financeEntry.findFirst({
    where: { id: b.entryId, tenantId: b.tenantId },
    select: { amount: true, paidPrincipal: true },
  });
  if (!conta) throw new RecusaDaBaixa("Lançamento não encontrado.");
  const saldo = saldoEmAberto(centavosDeDecimal(conta.amount), centavosDeDecimal(conta.paidPrincipal));
  return registrarBaixa(tx, { ...b, principalCentavos: saldo });
}

/**
 * Apaga uma baixa e refaz a conta. Conciliada é recusa: a linha do extrato
 * ficaria apontando para um pagamento que não existe — desconcilia primeiro.
 */
export async function apagarBaixa(tx: Tx, paymentId: string, tenantId: string): Promise<{ entryId: string }> {
  const b = await tx.financeEntryPayment.findFirst({
    where: { id: paymentId, tenantId },
    select: { entryId: true, bankMatch: { select: { id: true } } },
  });
  if (!b) throw new RecusaDaBaixa("Baixa não encontrada — atualize a tela.");
  if (b.bankMatch) throw new RecusaDaBaixa("Esta baixa está conciliada com o extrato — desfaça a conciliação primeiro.");
  await travarConta(tx, b.entryId);
  await tx.financeEntryPayment.delete({ where: { id: paymentId } });
  await recalcularConta(tx, b.entryId);
  return { entryId: b.entryId };
}

/**
 * As baixas de uma conta que veio do Omie, espelhando a situação de lá — o
 * Omie manda na conta que veio dele. Só mexe nas baixas **do Omie** (origem
 * OMIE, e as MIGRACAO, que eram a situação do Omie em 19/10):
 *
 * - paga lá e sem baixa nenhuma aqui: nasce a baixa cheia, no dia e no valor
 *   do Omie; com a baixa do Omie já aqui, ela acompanha valor e dia de lá;
 * - em aberto lá (baixa estornada): a baixa do Omie sai — e a linha do extrato
 *   que a conciliação pelo Omie tinha ligado a ela volta a pendente.
 *
 * A baixa feita no Connect (conciliada aqui, ou pelo botão Pagar) não é tocada:
 * quem a fez sabia de um pagamento que o Omie ainda não registrou. Quem chama
 * refaz a conta depois (`recalcularConta`).
 *
 * O Omie ainda não manda as baixas parciais (`TituloDoOmie.parcial` fica em
 * aberto), então a conta tem no máximo uma baixa do Omie.
 */
export async function espelharBaixaDoOmie(
  tx: Tx,
  conta: { id: string; tenantId: string; companyId: string },
  omie: { pago: boolean; paidAt: Date | null; valor: string }
): Promise<void> {
  const baixas = await tx.financeEntryPayment.findMany({
    where: { entryId: conta.id },
    select: { id: true, origin: true, principal: true, paidAt: true, bankMatch: { select: { id: true, transactionId: true } } },
  });
  const doOmie = baixas.filter((b) => b.origin === "OMIE" || b.origin === "MIGRACAO");
  if (omie.pago && omie.paidAt) {
    if (baixas.length === 0) {
      await tx.financeEntryPayment.create({
        data: {
          tenantId: conta.tenantId,
          companyId: conta.companyId,
          entryId: conta.id,
          paidAt: omie.paidAt,
          principal: omie.valor,
          cash: omie.valor,
          origin: "OMIE",
        },
      });
    } else if (doOmie.length === 1 && baixas.length === 1) {
      const b = doOmie[0]!;
      if (b.principal.toFixed(2) !== omie.valor || b.paidAt.getTime() !== omie.paidAt.getTime()) {
        await tx.financeEntryPayment.update({ where: { id: b.id }, data: { principal: omie.valor, cash: omie.valor, paidAt: omie.paidAt } });
      }
    }
    return;
  }
  for (const b of doOmie) {
    if (b.bankMatch) {
      await tx.bankTransactionMatch.delete({ where: { id: b.bankMatch.id } });
      const resta = await tx.bankTransactionMatch.count({ where: { transactionId: b.bankMatch.transactionId } });
      if (resta === 0) {
        await tx.bankTransaction.updateMany({
          where: { id: b.bankMatch.transactionId, status: "CONCILIADA" },
          data: { status: "PENDENTE", reconciledAt: null, reconciledById: null, reconciledViaOmie: false },
        });
      }
    }
    await tx.financeEntryPayment.delete({ where: { id: b.id } });
  }
}
