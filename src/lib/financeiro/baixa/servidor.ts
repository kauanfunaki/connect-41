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
//
// A fatura do cartão de crédito (lote D, 20/10) também é refeita aqui: a compra
// no cartão é uma baixa, então toda porta que paga ou desfaz passa pela fatura
// sem precisar lembrar dela.

import type { Prisma } from "@/generated/prisma/client";
import { MOTIVO_DO_OMIE, presaAoOmie, veioDoOmie } from "@/lib/integracoes/omie/virada";
import { ondeDaEmpresa } from "../planoDeContas";
import { centavosDeDecimal } from "../contas";
import { decimalDeCentavos } from "../manual";
import {
  categoriaDaParte,
  ehCategoriaDaParte,
  estadoDaConta,
  planoDoEspelho,
  saldoEmAberto,
  type BaixaNoEspelho,
  type TituloNoEspelho,
  type OrigemDaBaixa,
  type ParteDaBaixa,
  type TipoDoLancamento,
} from "./regras";
import { saoPauloParts } from "@/lib/agenda";
import { motivoDoBloqueioDeBaixa, type StatusDeAprovacao } from "../aprovacao/regras";
import { instanteDaData } from "../periodo";
import { cicloDaCompra, descricaoDaFatura, mesDoCiclo } from "../cartao";
import { categoriaDaFatura, credorDaFatura } from "../cartaoServidor";
import { ehCartaoDeCredito } from "../tiposDeConta";

type Tx = Prisma.TransactionClient;

/** Recusa de regra dentro da transação — vira mensagem para a tela. */
export class RecusaDaBaixa extends Error {}

export type { OrigemDaBaixa };

type StatusDaConta = "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";

/** A conta como está no banco agora — lida pela trava. */
type ContaTravada = {
  tenantId: string;
  companyId: string;
  kind: TipoDoLancamento;
  status: StatusDaConta;
  approvalStatus: StatusDeAprovacao;
  valorCentavos: number;
  baixadoCentavos: number;
  omieTitleId: string | null;
  omieMovementId: string | null;
};

/**
 * Trava a linha da conta até o fim da transação e a lê **pela trava**. Duas
 * baixas ao mesmo tempo na mesma conta leriam o mesmo saldo e pagariam o
 * título duas vezes; com a trava, a segunda espera a primeira.
 *
 * A leitura tem de ser a do `FOR UPDATE`, e não um `findFirst` depois dele: no
 * REPEATABLE READ do MySQL a leitura comum enxerga a foto do banco tirada na
 * primeira leitura da transação. A conciliação lê a linha do extrato antes de
 * baixar — com a leitura comum, veria o saldo de antes da baixa que acabou de
 * passar na frente, e pagaria o título de novo.
 */
async function travarConta(tx: Tx, entryId: string): Promise<ContaTravada | null> {
  const [l] = await tx.$queryRaw<
    {
      tenantId: string;
      companyId: string;
      kind: TipoDoLancamento;
      status: StatusDaConta;
      approvalStatus: StatusDeAprovacao;
      amount: string;
      paidPrincipal: string;
      omieTitleId: string | null;
      omieMovementId: string | null;
    }[]
  >`SELECT tenantId, companyId, kind, status, approvalStatus, CAST(amount AS CHAR) AS amount, CAST(paidPrincipal AS CHAR) AS paidPrincipal,
            omieTitleId, omieMovementId
      FROM finance_entries WHERE id = ${entryId} FOR UPDATE`;
  if (!l) return null;
  return {
    tenantId: l.tenantId,
    companyId: l.companyId,
    kind: l.kind,
    status: l.status,
    approvalStatus: l.approvalStatus,
    valorCentavos: centavosDeDecimal(l.amount),
    baixadoCentavos: centavosDeDecimal(l.paidPrincipal),
    omieTitleId: l.omieTitleId,
    omieMovementId: l.omieMovementId,
  };
}

/**
 * A conta que veio do Omie é dele até a empresa virar para o Connect (lote E):
 * a baixa no Connect não chegaria ao Omie, e a leitura seguinte a contaria
 * como conflito. A virada é coisa rara; lê sem trava.
 */
async function presaNaTrava(tx: Tx, conta: ContaTravada): Promise<boolean> {
  if (!veioDoOmie(conta)) return false;
  const empresa = await tx.company.findUnique({ where: { id: conta.companyId }, select: { omieCutoverAt: true } });
  return presaAoOmie(conta, empresa);
}

/**
 * As baixas da conta, também pela trava — pelo mesmo motivo de `travarConta`:
 * a baixa que outra transação acabou de gravar tem de entrar na soma.
 */
async function baixasTravadas(tx: Tx, entryId: string): Promise<{ principalCentavos: number; paidAt: Date }[]> {
  const linhas = await tx.$queryRaw<{ principal: string; paidAt: string }[]>`
    SELECT CAST(principal AS CHAR) AS principal, DATE_FORMAT(paidAt, '%Y-%m-%dT%H:%i:%s.%f') AS paidAt
      FROM finance_entry_payments WHERE entryId = ${entryId} FOR UPDATE`;
  // O Prisma grava DateTime em UTC; o texto sai com microssegundos, a data do JS
  // vai até o milissegundo.
  return linhas.map((l) => ({ principalCentavos: centavosDeDecimal(l.principal), paidAt: new Date(`${l.paidAt.slice(0, 23)}Z`) }));
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
  const conta = await travarConta(tx, entryId);
  if (!conta) throw new RecusaDaBaixa("Lançamento não encontrado.");
  const baixas = await baixasTravadas(tx, entryId);
  const estado = estadoDaConta(
    { valorCentavos: conta.valorCentavos, status: conta.status },
    baixas.map((p) => ({ principalCentavos: p.principalCentavos, dataKey: saoPauloParts(p.paidAt).dateKey }))
  );
  const ultima = estado.quitada ? baixas.reduce<Date | null>((m, p) => (m === null || p.paidAt > m ? p.paidAt : m), null) : null;
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
  const conta = await travarConta(tx, b.entryId);
  if (!conta || conta.tenantId !== b.tenantId) throw new RecusaDaBaixa("Lançamento não encontrado.");
  if (conta.status === "CANCELADO") throw new RecusaDaBaixa("Conta cancelada não recebe baixa.");
  // O espelho do Omie e a migração gravam as baixas que vêm de lá; as outras
  // portas (botão, lote, conciliação, transferência) esperam a virada.
  if (b.origin !== "OMIE" && b.origin !== "MIGRACAO" && (await presaNaTrava(tx, conta))) throw new RecusaDaBaixa(MOTIVO_DO_OMIE.baixa);
  // Aprovação por alçada, relida com a conta travada: aguardando ou reprovada
  // não sai do caixa por caminho nenhum — botão, conciliação, parcial.
  const bloqueio = motivoDoBloqueioDeBaixa(conta);
  if (bloqueio) throw new RecusaDaBaixa(bloqueio);
  const saldo = saldoEmAberto(conta.valorCentavos, conta.baixadoCentavos);
  if (b.principalCentavos <= 0) throw new RecusaDaBaixa("O valor da baixa não pode ser zero.");
  if (b.principalCentavos > saldo) {
    throw new RecusaDaBaixa(saldo === 0 ? "Esta conta já está paga — atualize a tela." : "O valor da baixa passa do saldo em aberto — a conta acabou de mudar; atualize a tela.");
  }

  const juros = b.jurosCentavos ?? 0;
  const multa = b.multaCentavos ?? 0;
  const desconto = b.descontoCentavos ?? 0;
  const caixa = b.principalCentavos + juros + multa - desconto;
  if (juros < 0 || multa < 0 || desconto < 0 || caixa < 0) throw new RecusaDaBaixa("Juros, multa ou desconto inválido.");

  // Pelo cartão de crédito: a compra entra na fatura do ciclo.
  const cartao = b.bankAccountId ? await travarCartao(tx, b.bankAccountId) : null;
  const faturaId = cartao ? await faturaDaCompra(tx, cartao, { entryId: b.entryId, kind: conta.kind, paidAt: b.paidAt, userId: b.userId ?? null }) : null;

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
      cardInvoiceId: faturaId,
      note: b.note ?? null,
      origin: b.origin,
      createdById: b.userId ?? null,
    },
    select: { id: true, principal: true },
  });
  const { quitada } = await recalcularConta(tx, b.entryId);
  if (faturaId) await refazerFatura(tx, faturaId);
  return { paymentId: criada.id, quitada, caixaCentavos: caixa, principal: criada.principal };
}

/** Quita o saldo inteiro de uma vez — a conciliação, o lançamento que nasce pago, a transferência. */
export async function quitarConta(tx: Tx, b: Omit<NovaBaixa, "principalCentavos">): Promise<BaixaGravada> {
  const conta = await travarConta(tx, b.entryId);
  if (!conta || conta.tenantId !== b.tenantId) throw new RecusaDaBaixa("Lançamento não encontrado.");
  return registrarBaixa(tx, { ...b, principalCentavos: saldoEmAberto(conta.valorCentavos, conta.baixadoCentavos) });
}

/**
 * Apaga uma baixa e refaz a conta. Conciliada é recusa: a linha do extrato
 * ficaria apontando para um pagamento que não existe — desconcilia primeiro.
 */
export async function apagarBaixa(tx: Tx, paymentId: string, tenantId: string): Promise<{ entryId: string }> {
  const b = await tx.financeEntryPayment.findFirst({
    where: { id: paymentId, tenantId },
    select: { entryId: true, origin: true, cardInvoiceId: true, bankMatch: { select: { id: true } } },
  });
  if (!b) throw new RecusaDaBaixa("Baixa não encontrada — atualize a tela.");
  if (b.bankMatch) throw new RecusaDaBaixa("Esta baixa está conciliada com o extrato — desfaça a conciliação primeiro.");
  const conta = await travarConta(tx, b.entryId);
  // A baixa que veio do Omie volta na leitura seguinte — até a virada (lote E).
  if (b.origin === "OMIE" && conta && (await presaNaTrava(tx, conta))) throw new RecusaDaBaixa(MOTIVO_DO_OMIE.desfazerBaixa);
  // A compra no cartão sai da fatura — a não ser que a fatura já tenha pagamento.
  if (b.cardInvoiceId) await travarFaturaSemPagamento(tx, b.cardInvoiceId, "tirar uma compra dela");
  // Condicional: a leitura acima pode ser a foto de antes de alguém apagar ou
  // conciliar esta baixa.
  const apagada = await tx.financeEntryPayment.deleteMany({ where: { id: paymentId, bankMatch: { is: null } } });
  if (apagada.count !== 1) throw new RecusaDaBaixa("Esta baixa acabou de mudar — atualize a tela.");
  await recalcularConta(tx, b.entryId);
  if (b.cardInvoiceId) await refazerFatura(tx, b.cardInvoiceId);
  return { entryId: b.entryId };
}

/**
 * Muda o dia (e, se faltava, a conta bancária) de uma baixa e refaz a conta —
 * a conciliação põe a baixa no dia do extrato, e o desfazer devolve o dia de
 * antes. Trava a conta antes de mexer na baixa: toda porta trava a conta
 * primeiro, e na mesma ordem nenhuma fica esperando a outra para sempre.
 */
export async function mudarDiaDaBaixa(tx: Tx, b: { id: string; entryId: string }, dados: { paidAt: Date; bankAccountId?: string | null }) {
  await travarConta(tx, b.entryId);
  await tx.financeEntryPayment.update({
    where: { id: b.id },
    data: { paidAt: dados.paidAt, ...(dados.bankAccountId !== undefined ? { bankAccountId: dados.bankAccountId } : {}) },
  });
  await recalcularConta(tx, b.entryId);
}

// ─── Cartão de crédito (lote D, 20/10) ───────────────────────────────────────
//
// A compra no cartão é a baixa saindo por ele; a fatura do ciclo é a conta a
// pagar que soma as compras — ver `../cartao.ts`. A ordem das travas é a da
// baixa (a conta, depois o cartão, depois a fatura), e quem só mexe na fatura
// trava só ela: nenhuma porta espera a outra para sempre.

type CartaoTravado = { id: string; tenantId: string; companyId: string; nickname: string; fechamento: number; vencimento: number };

/**
 * O cartão da baixa, travado: duas compras ao mesmo tempo no mesmo cartão
 * criariam a mesma fatura duas vezes. `null` quando a conta não é cartão.
 */
async function travarCartao(tx: Tx, bankAccountId: string): Promise<CartaoTravado | null> {
  const tipo = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { type: true } });
  if (!ehCartaoDeCredito(tipo?.type)) return null;
  const [c] = await tx.$queryRaw<
    { id: string; tenantId: string; companyId: string; nickname: string; cardClosingDay: number | null; cardDueDay: number | null }[]
  >`SELECT id, tenantId, companyId, nickname, cardClosingDay, cardDueDay FROM bank_accounts WHERE id = ${bankAccountId} FOR UPDATE`;
  if (!c) return null;
  if (!c.cardClosingDay || !c.cardDueDay) {
    throw new RecusaDaBaixa(`O cartão ${c.nickname} está sem os dias de fechamento e vencimento — complete o cadastro em Contas a pagar › Cartões de crédito.`);
  }
  return { id: c.id, tenantId: c.tenantId, companyId: c.companyId, nickname: c.nickname, fechamento: Number(c.cardClosingDay), vencimento: Number(c.cardDueDay) };
}

/**
 * A fatura em que a compra entra — a do ciclo do dia da baixa —, criada se
 * ainda não existe. A fatura que já tem pagamento não recebe compra: o valor
 * dela é o que foi pago.
 */
async function faturaDaCompra(
  tx: Tx,
  cartao: CartaoTravado,
  compra: { entryId: string; kind: TipoDoLancamento; paidAt: Date; userId: string | null }
): Promise<string> {
  if (compra.kind !== "PAGAR") throw new RecusaDaBaixa("Cartão de crédito só paga conta a pagar.");
  const conta = await tx.financeEntry.findUnique({ where: { id: compra.entryId }, select: { cardAccountId: true, transferId: true } });
  if (conta?.cardAccountId) throw new RecusaDaBaixa("A fatura do cartão se paga pelo banco.");
  if (conta?.transferId) throw new RecusaDaBaixa("Transferência não sai pelo cartão.");

  const c = cicloDaCompra(saoPauloParts(compra.paidAt).dateKey, { fechamento: cartao.fechamento, vencimento: cartao.vencimento });
  // Pela trava: a fatura que outra transação acabou de pagar tem de aparecer paga.
  const [ja] = await tx.$queryRaw<{ id: string; paidPrincipal: string }[]>`
    SELECT id, CAST(paidPrincipal AS CHAR) AS paidPrincipal FROM finance_entries
      WHERE cardAccountId = ${cartao.id} AND cardCycle = ${c.ciclo} FOR UPDATE`;
  if (ja) {
    if (centavosDeDecimal(ja.paidPrincipal) > 0) {
      throw new RecusaDaBaixa(`A fatura de ${mesDoCiclo(c.ciclo)} do cartão ${cartao.nickname} já tem pagamento — desfaça o pagamento dela antes de pôr outra compra.`);
    }
    return ja.id;
  }
  const criada = await tx.financeEntry.create({
    data: {
      tenantId: cartao.tenantId,
      companyId: cartao.companyId,
      kind: "PAGAR",
      status: "CONFERIDO",
      // As compras já passaram pela alçada, cada uma na sua conta.
      approvalStatus: "NAO_REQUER",
      counterpartyId: await credorDaFatura(tx, cartao.tenantId, cartao.companyId, cartao.nickname),
      categoryId: await categoriaDaFatura(tx, cartao.tenantId, cartao.companyId),
      competence: c.ciclo,
      dueDate: instanteDaData(c.vencimentoKey),
      amount: "0",
      description: descricaoDaFatura(cartao.nickname, c.ciclo),
      cardAccountId: cartao.id,
      cardCycle: c.ciclo,
      createdById: compra.userId,
      reviewedById: compra.userId,
      reviewedAt: new Date(),
    },
    select: { id: true },
  });
  return criada.id;
}

/** Trava a fatura e recusa a que já tem pagamento — tirar compra dela mudaria o que foi pago. */
async function travarFaturaSemPagamento(tx: Tx, faturaId: string, paraQue: string): Promise<void> {
  const [f] = await tx.$queryRaw<{ cardAccountId: string | null; cardCycle: string | null; paidPrincipal: string }[]>`
    SELECT cardAccountId, cardCycle, CAST(paidPrincipal AS CHAR) AS paidPrincipal FROM finance_entries WHERE id = ${faturaId} FOR UPDATE`;
  if (!f || centavosDeDecimal(f.paidPrincipal) === 0) return;
  const cartao = f.cardAccountId ? await tx.bankAccount.findUnique({ where: { id: f.cardAccountId }, select: { nickname: true } }) : null;
  throw new RecusaDaBaixa(
    `A fatura de ${f.cardCycle ? mesDoCiclo(f.cardCycle) : ""} do cartão ${cartao?.nickname ?? ""} já tem pagamento — desfaça o pagamento da fatura antes de ${paraQue}.`
  );
}

/**
 * A fatura é a soma das compras dela, lida pela trava (a compra que outra
 * transação acabou de tirar não pode entrar na conta). Sem compra nenhuma, a
 * fatura sai — cancelada — e volta se outra compra cair no ciclo.
 */
async function refazerFatura(tx: Tx, faturaId: string): Promise<void> {
  const [soma] = await tx.$queryRaw<{ total: string | null }[]>`
    SELECT CAST(SUM(cash) AS CHAR) AS total FROM finance_entry_payments WHERE cardInvoiceId = ${faturaId} FOR UPDATE`;
  const centavos = centavosDeDecimal(soma?.total ?? "0");
  if (centavos <= 0) {
    await tx.financeEntry.update({ where: { id: faturaId }, data: { amount: "0", status: "CANCELADO", closeReason: "CANCELADO", paidAt: null } });
    return;
  }
  const [f] = await tx.$queryRaw<{ status: StatusDaConta }[]>`SELECT status FROM finance_entries WHERE id = ${faturaId} FOR UPDATE`;
  await tx.financeEntry.update({
    where: { id: faturaId },
    data: { amount: decimalDeCentavos(centavos), ...(f?.status === "CANCELADO" ? { status: "CONFERIDO", closeReason: null } : {}) },
  });
  await recalcularConta(tx, faturaId);
}

/** O que o espelho do Omie precisa de cada baixa da conta. */
export const BAIXA_NO_ESPELHO = {
  id: true,
  origin: true,
  principal: true,
  paidAt: true,
  omieBaixaId: true,
  bankMatch: { select: { id: true, transactionId: true, transaction: { select: { reconciledViaOmie: true, _count: { select: { matches: true } } } } } },
} as const satisfies Prisma.FinanceEntryPaymentSelect;

type LinhaNoEspelho = Prisma.FinanceEntryPaymentGetPayload<{ select: typeof BAIXA_NO_ESPELHO }>;

/** A baixa lida do banco no formato de `planoDoEspelho`. */
export function paraOEspelho(b: LinhaNoEspelho): BaixaNoEspelho {
  return {
    id: b.id,
    origem: b.origin,
    principalCentavos: centavosDeDecimal(b.principal),
    paidAtMs: b.paidAt.getTime(),
    chave: b.omieBaixaId,
    vinculo: b.bankMatch ? { peloOmie: b.bankMatch.transaction.reconciledViaOmie && b.bankMatch.transaction._count.matches === 1 } : null,
  };
}

/**
 * As baixas de uma conta que veio do Omie, espelhando a situação de lá
 * (`planoDoEspelho` diz o quê). A linha do extrato que a conciliação pelo
 * Omie tinha ligado a uma baixa que muda ou sai volta a pendente — a próxima
 * conciliação pelo Omie a casa de novo, se ainda casar. Quem chama refaz a
 * conta depois (`recalcularConta`).
 *
 * A parcial do Omie chega uma baixa por pagamento de lá, com o código
 * (`omieBaixaId`); o título pago chega numa baixa só, no dia do último
 * pagamento, como sempre foi.
 */
export async function espelharBaixaDoOmie(tx: Tx, conta: { id: string; tenantId: string; companyId: string }, omie: TituloNoEspelho): Promise<void> {
  await travarConta(tx, conta.id);
  const baixas = await tx.financeEntryPayment.findMany({ where: { entryId: conta.id }, select: BAIXA_NO_ESPELHO });
  const plano = planoDoEspelho(baixas.map(paraOEspelho), omie);
  const porId = new Map(baixas.map((b) => [b.id, b]));

  async function desvincular(id: string) {
    const m = porId.get(id)?.bankMatch;
    if (!m) return;
    await tx.bankTransactionMatch.delete({ where: { id: m.id } });
    await tx.bankTransaction.updateMany({
      where: { id: m.transactionId, status: "CONCILIADA" },
      data: { status: "PENDENTE", reconciledAt: null, reconciledById: null, reconciledViaOmie: false },
    });
  }

  // Apagar antes de criar: a baixa que sai não conta no saldo de quem entra.
  for (const b of plano.apagar) {
    if (b.desvincular) await desvincular(b.id);
    await tx.financeEntryPayment.delete({ where: { id: b.id } });
  }
  for (const a of plano.atualizar) {
    if (a.desvincular) await desvincular(a.id);
    const valor = decimalDeCentavos(a.principalCentavos);
    await tx.financeEntryPayment.update({ where: { id: a.id }, data: { principal: valor, cash: valor, paidAt: new Date(a.paidAtMs), omieBaixaId: a.chave } });
  }
  for (const c of plano.criar) {
    const valor = decimalDeCentavos(c.principalCentavos);
    await tx.financeEntryPayment.create({
      data: {
        tenantId: conta.tenantId,
        companyId: conta.companyId,
        entryId: conta.id,
        paidAt: new Date(c.paidAtMs),
        principal: valor,
        cash: valor,
        origin: "OMIE",
        omieBaixaId: c.chave,
      },
    });
  }
}
