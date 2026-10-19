"use server";

// Conferir, baixar e desfazer baixa.
//
// Ficam em `lib` e não ao lado de uma rota porque servem as **duas** telas —
// `/pagar` e `/receber` são a mesma tela com outro sinal, e pendurar as actions
// numa delas faria a outra importar de um vizinho por acidente.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { podeConferir, centavosDeDecimal } from "./contas";
import { validarBaixa, saldoEmAberto } from "./baixa/regras";
import { registrarBaixa, apagarBaixa, RecusaDaBaixa, type OrigemDaBaixa } from "./baixa/servidor";
import { decimalDeCentavos } from "./manual";
import { instanteDaData } from "./periodo";
import { setorDoModulo } from "@/lib/modules";
import { motivoDoBloqueioDeBaixa } from "./aprovacao/regras";
import { sincronizarAcordos } from "./cobranca/sincronizar";
import { podeDefinirCentro, MAXIMO_DE_CONTAS_POR_DEFINICAO } from "./centroDeCusto";

// `SECTOR` é o de origem, usado só como padrão. As ações servem `/pagar` e
// `/receber`, que podem estar em setores diferentes num tenant: o gate aceita
// quem atua no setor de qualquer um dos dois, porque a checagem roda antes de
// se saber o tipo do lançamento — e a tela de cada um já barra quem não é dele.
const SECTOR = "bpo";
const MODULOS = ["bpo_contas_pagar", "bpo_contas_receber"];

export type AcaoDeContaState = { error: string } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado" as const, ctx: null };
  const setores = await Promise.all(MODULOS.map((m) => setorDoModulo(ctx.tenantId, m)));
  if (!setores.some((s) => canActOnSector(ctx, s ?? SECTOR))) return { erro: "Sem permissão no BPO" as const, ctx: null };
  return { erro: null, ctx };
}

/** Carrega o lançamento conferindo o tenant, e devolve o que as regras pedem. */
async function contaDoTenant(entryId: string, tenantId: string) {
  const prisma = getPrisma();
  return prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      paidAt: true,
      amount: true,
      approvalStatus: true,
      counterparty: { select: { name: true } },
    },
  });
}

function revalidar() {
  revalidatePath("/pagar");
  revalidatePath("/receber");
  // Baixa de parcela muda o acordo (cumprido) e tira o título da fila.
  revalidatePath("/cobranca", "layout");
}

export async function conferirConta(entryId: string): Promise<AcaoDeContaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const conta = await contaDoTenant(entryId, ctx.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };

  const veredito = podeConferir(conta);
  if (!veredito.pode) return { error: veredito.motivo };

  const prisma = getPrisma();
  await prisma.financeEntry.update({
    where: { id: entryId },
    data: { status: "CONFERIDO", reviewedById: ctx.userId ?? null, reviewedAt: new Date() },
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "finance.review",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: { contraparte: conta.counterparty.name },
  });

  revalidar();
  return null;
}

// ─── Baixa (lote C, 19/10) ─────────────────────────────────────────────────
//
// A baixa deixou de ser só uma data: é um registro com conta bancária, juros,
// multa e desconto, e pode ser parcial — ver `src/lib/financeiro/baixa/`. A
// janela pede os dados (`dadosDaBaixa`), grava (`registrarPagamento`) e
// lista as baixas da conta para desfazer uma a uma (`desfazerBaixa`).

export type BaixaDaConta = {
  id: string;
  dataKey: string;
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  caixaCentavos: number;
  contaNome: string | null;
  observacao: string | null;
  origem: OrigemDaBaixa;
  /** Ligada a uma linha do extrato — desfazer é na conciliação. */
  conciliada: boolean;
};

export type DadosDaBaixa =
  | {
      ok: true;
      kind: "PAGAR" | "RECEBER";
      contraparteNome: string;
      valorCentavos: number;
      saldoCentavos: number;
      /** Motivo de a aprovação por alçada travar a baixa. */
      bloqueio: string | null;
      contas: { id: string; nome: string }[];
      baixas: BaixaDaConta[];
    }
  | { ok: false; erro: string };

/** Contas bancárias ativas da empresa, para o "de qual conta saiu". */
async function contasDaEmpresa(tenantId: string, companyId: string) {
  const contas = await getPrisma().bankAccount.findMany({
    where: { tenantId, companyId, active: true },
    select: { id: true, nickname: true, accountNumber: true },
    orderBy: { nickname: "asc" },
  });
  return contas.map((c) => ({ id: c.id, nome: `${c.nickname} ${c.accountNumber}` }));
}

/** A conta, o saldo, as contas bancárias e as baixas que já tem — o que a janela da baixa precisa. */
export async function dadosDaBaixa(entryId: string): Promise<DadosDaBaixa> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { ok: false, erro: erro ?? "Não autenticado" };
  const conta = await getPrisma().financeEntry.findFirst({
    where: { id: entryId, tenantId: ctx.tenantId },
    select: {
      kind: true,
      status: true,
      amount: true,
      paidPrincipal: true,
      approvalStatus: true,
      companyId: true,
      counterparty: { select: { name: true } },
      payments: {
        select: {
          id: true,
          paidAt: true,
          principal: true,
          interest: true,
          fine: true,
          discount: true,
          cash: true,
          note: true,
          origin: true,
          bankAccount: { select: { nickname: true, accountNumber: true } },
          bankMatch: { select: { id: true } },
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!conta) return { ok: false, erro: "Lançamento não encontrado." };
  if (conta.status === "CANCELADO") return { ok: false, erro: "Lançamento cancelado não recebe baixa." };
  const valor = centavosDeDecimal(conta.amount);
  return {
    ok: true,
    kind: conta.kind,
    contraparteNome: conta.counterparty.name,
    valorCentavos: valor,
    saldoCentavos: saldoEmAberto(valor, centavosDeDecimal(conta.paidPrincipal)),
    bloqueio: motivoDoBloqueioDeBaixa(conta),
    contas: await contasDaEmpresa(ctx.tenantId, conta.companyId),
    baixas: conta.payments.map((p) => ({
      id: p.id,
      dataKey: saoPauloParts(p.paidAt).dateKey,
      principalCentavos: centavosDeDecimal(p.principal),
      jurosCentavos: centavosDeDecimal(p.interest),
      multaCentavos: centavosDeDecimal(p.fine),
      descontoCentavos: centavosDeDecimal(p.discount),
      caixaCentavos: centavosDeDecimal(p.cash),
      contaNome: p.bankAccount ? `${p.bankAccount.nickname} ${p.bankAccount.accountNumber}` : null,
      observacao: p.note,
      origem: p.origin,
      conciliada: p.bankMatch !== null,
    })),
  };
}

/**
 * Registra uma baixa: o dinheiro saiu (ou entrou) naquele dia, daquela conta,
 * com aquele valor. Parcial quando o valor fica abaixo do saldo — a conta
 * continua em aberto com o resto.
 *
 * A data vem de fora porque **baixa atrasada é comum** — alguém lança na
 * segunda o que pagou na sexta. Pagar direto do `PROVISORIO` é permitido:
 * pagar implica ter conferido.
 */
export async function registrarPagamento(formData: FormData): Promise<{ error: string } | { ok: true; quitada: boolean }> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const entryId = texto("entryId");
  const tenantId = ctx.tenantId;
  const prisma = getPrisma();

  const conta = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      paidPrincipal: true,
      approvalStatus: true,
      companyId: true,
      counterparty: { select: { name: true } },
    },
  });
  if (!conta) return { error: "Lançamento não encontrado." };
  if (conta.status === "CANCELADO") return { error: "Lançamento cancelado não volta a ser conta." };
  // Aprovação por alçada: aguardando ou reprovada não sai do caixa — nem em parte.
  const bloqueio = motivoDoBloqueioDeBaixa(conta);
  if (bloqueio) return { error: bloqueio };

  const saldo = saldoEmAberto(centavosDeDecimal(conta.amount), centavosDeDecimal(conta.paidPrincipal));
  const v = validarBaixa(
    { data: texto("data"), principal: texto("valor"), juros: texto("juros"), multa: texto("multa"), desconto: texto("desconto") },
    saldo,
    saoPauloParts(new Date()).dateKey
  );
  if (!v.ok) return { error: v.erro };
  const d = v.dados;

  const contaBancariaId = texto("contaBancariaId") || null;
  if (contaBancariaId) {
    const banco = await prisma.bankAccount.findFirst({ where: { id: contaBancariaId, tenantId, companyId: conta.companyId }, select: { id: true } });
    if (!banco) return { error: "Conta bancária não encontrada nesta empresa." };
  }
  const observacao = texto("observacao").slice(0, 255) || null;

  let gravada: { paymentId: string; quitada: boolean };
  try {
    gravada = await prisma.$transaction(async (tx) => {
      const b = await registrarBaixa(tx, {
        tenantId,
        entryId,
        paidAt: instanteDaData(d.dataKey),
        principalCentavos: d.principalCentavos,
        jurosCentavos: d.jurosCentavos,
        multaCentavos: d.multaCentavos,
        descontoCentavos: d.descontoCentavos,
        bankAccountId: contaBancariaId,
        note: observacao,
        origin: "MANUAL",
        userId: ctx.userId ?? null,
      });
      // A baixa que quita a última parcela de um acordo cumpre o acordo.
      await sincronizarAcordos(tx, tenantId, [entryId]);
      return b;
    });
  } catch (err) {
    if (err instanceof RecusaDaBaixa) return { error: err.message };
    throw err;
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "finance.pay",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: {
      kind: conta.kind,
      contraparte: conta.counterparty.name,
      pagoEm: d.dataKey,
      valor: decimalDeCentavos(d.principalCentavos),
      ...(d.jurosCentavos ? { juros: decimalDeCentavos(d.jurosCentavos) } : {}),
      ...(d.multaCentavos ? { multa: decimalDeCentavos(d.multaCentavos) } : {}),
      ...(d.descontoCentavos ? { desconto: decimalDeCentavos(d.descontoCentavos) } : {}),
      total: decimalDeCentavos(d.caixaCentavos),
      parcial: !gravada.quitada,
      contaBancaria: contaBancariaId,
      baixa: gravada.paymentId,
    },
  });

  revalidar();
  return { ok: true, quitada: gravada.quitada };
}

/**
 * Desfaz uma baixa. Existe porque a alternativa seria corrigir a data por cima
 * e sobrescrever em silêncio o pagamento real — desfazer e refazer deixa
 * rastro no AuditLog. Baixa conciliada se desfaz na conciliação, que devolve a
 * linha do extrato junto.
 */
export async function desfazerBaixa(paymentId: string): Promise<AcaoDeContaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;
  const prisma = getPrisma();
  const baixa = await prisma.financeEntryPayment.findFirst({
    where: { id: paymentId, tenantId },
    select: { entryId: true, principal: true, cash: true, paidAt: true, entry: { select: { counterparty: { select: { name: true } } } } },
  });
  if (!baixa) return { error: "Baixa não encontrada — atualize a tela." };

  try {
    await prisma.$transaction(async (tx) => {
      await apagarBaixa(tx, paymentId, tenantId);
      // Parcela de acordo cumprido que deixa de estar paga devolve o acordo a ativo.
      await sincronizarAcordos(tx, tenantId, [baixa.entryId]);
    });
  } catch (err) {
    if (err instanceof RecusaDaBaixa) return { error: err.message };
    throw err;
  }

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "finance.unpay",
    entityType: "FinanceEntry",
    entityId: baixa.entryId,
    metadata: {
      contraparte: baixa.entry.counterparty.name,
      valor: baixa.principal.toString(),
      total: baixa.cash.toString(),
      pagoEm: saoPauloParts(baixa.paidAt).dateKey,
    },
  });

  revalidar();
  return null;
}

// ─── Centro de custo ────────────────────────────────────────────────────────

const MODULO_DO_TIPO = { PAGAR: "bpo_contas_pagar", RECEBER: "bpo_contas_receber" } as const;

/**
 * Define (ou tira, com `costCenterId` vazio) o centro de custo de uma ou várias
 * contas selecionadas em `/pagar` ou `/receber`.
 *
 * Numa transação, uma atualização por centro anterior condicionada a ele: se
 * outra pessoa trocou o centro de alguma conta entre a leitura e aqui, nada
 * muda e a tela pede para atualizar — em vez de sobrescrever a decisão dela.
 * Uma linha de auditoria por conta, com o centro de antes e o de depois.
 */
export async function definirCentroDeCusto(formData: FormData): Promise<AcaoDeContaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;

  const ids = [...new Set(formData.getAll("entryIds").map((v) => String(v)).filter(Boolean))];
  const centroId = String(formData.get("costCenterId") ?? "").trim() || null;
  const prisma = getPrisma();

  const [contas, centro] = await Promise.all([
    ids.length > 0 && ids.length <= MAXIMO_DE_CONTAS_POR_DEFINICAO
      ? prisma.financeEntry.findMany({
          where: { id: { in: ids }, tenantId },
          select: { id: true, kind: true, companyId: true, costCenterId: true },
        })
      : Promise.resolve([]),
    centroId
      ? prisma.costCenter.findFirst({ where: { id: centroId, tenantId }, select: { id: true, companyId: true, active: true, name: true } })
      : Promise.resolve(null),
  ]);
  if (centroId && !centro) return { error: "Centro de custo não encontrado." };

  // O gate de `contexto` aceita quem atua em qualquer um dos dois módulos; aqui
  // já se sabe o tipo de cada conta, e cada tipo exige o setor do seu módulo.
  for (const kind of new Set(contas.map((c) => c.kind))) {
    const setor = (await setorDoModulo(tenantId, MODULO_DO_TIPO[kind])) ?? SECTOR;
    if (!canActOnSector(ctx, setor)) return { error: kind === "PAGAR" ? "Sem permissão em contas a pagar." : "Sem permissão em contas a receber." };
  }

  const veredito = podeDefinirCentro(contas, centro ? { companyId: centro.companyId, active: centro.active, nome: centro.name } : null, ids.length);
  if (!veredito.pode) return { error: veredito.motivo };

  const mudam = contas.filter((c) => c.costCenterId !== centroId);
  if (mudam.length === 0) return null;

  const porAnterior = new Map<string | null, string[]>();
  for (const c of mudam) porAnterior.set(c.costCenterId, [...(porAnterior.get(c.costCenterId) ?? []), c.id]);

  const aplicou = await prisma.$transaction(async (tx) => {
    for (const [anterior, grupo] of porAnterior) {
      const r = await tx.financeEntry.updateMany({
        where: { id: { in: grupo }, tenantId, costCenterId: anterior },
        data: { costCenterId: centroId },
      });
      if (r.count !== grupo.length) throw new CentroMudou();
    }
    return true;
  }).catch((e) => {
    if (e instanceof CentroMudou) return false;
    throw e;
  });
  if (!aplicou) return { error: "O centro de alguma conta acabou de mudar — atualize a tela." };

  for (const c of mudam) {
    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: "finance.cost_center_set",
      entityType: "FinanceEntry",
      entityId: c.id,
      metadata: { de: c.costCenterId, para: centroId, emLote: mudam.length > 1 },
    });
  }

  revalidar();
  // O centro muda a DRE por centro e o quadro por centro da DRE econômica.
  revalidatePath("/dre/economica");
  revalidatePath("/lancamentos");
  return null;
}

/** Aborta a transação quando uma conta mudou de centro entre a leitura e a escrita. */
class CentroMudou extends Error {}
