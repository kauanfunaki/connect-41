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
    { tenantId: string; companyId: string; kind: TipoDoLancamento; status: StatusDaConta; approvalStatus: StatusDeAprovacao; amount: string; paidPrincipal: string }[]
  >`SELECT tenantId, companyId, kind, status, approvalStatus, CAST(amount AS CHAR) AS amount, CAST(paidPrincipal AS CHAR) AS paidPrincipal
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
  };
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
    select: { entryId: true, bankMatch: { select: { id: true } } },
  });
  if (!b) throw new RecusaDaBaixa("Baixa não encontrada — atualize a tela.");
  if (b.bankMatch) throw new RecusaDaBaixa("Esta baixa está conciliada com o extrato — desfaça a conciliação primeiro.");
  await travarConta(tx, b.entryId);
  // Condicional: a leitura acima pode ser a foto de antes de alguém apagar ou
  // conciliar esta baixa.
  const apagada = await tx.financeEntryPayment.deleteMany({ where: { id: paymentId, bankMatch: { is: null } } });
  if (apagada.count !== 1) throw new RecusaDaBaixa("Esta baixa acabou de mudar — atualize a tela.");
  await recalcularConta(tx, b.entryId);
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
