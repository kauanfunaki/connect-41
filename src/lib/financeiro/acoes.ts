"use server";

// Conferir, baixar e desfazer baixa.
//
// Ficam em `lib` e não ao lado de uma rota porque servem as **duas** telas —
// `/pagar` e `/receber` são a mesma tela com outro sinal, e pendurar as actions
// numa delas faria a outra importar de um vizinho por acidente.

import { revalidatePath } from "next/cache";
import { MOTIVO_DO_OMIE, presaAoOmie } from "@/lib/integracoes/omie/virada";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { podeConferir, centavosDeDecimal } from "./contas";
import { validarBaixa, saldoEmAberto } from "./baixa/regras";
import { registrarBaixa, quitarConta, apagarBaixa, RecusaDaBaixa, type OrigemDaBaixa } from "./baixa/servidor";
import { MAXIMO_DO_LOTE, separarLote, validarDiaDoLote, type ForaDoLote } from "./baixa/lote";
import { nomeExibicao } from "@/lib/companyName";
import { contaPrevistaEmComum } from "./contaPrevista";
import { decimalDeCentavos } from "./manual";
import { instanteDaData } from "./periodo";
import { setorDoModulo } from "@/lib/modules";
import { motivoDoBloqueioDeBaixa } from "./aprovacao/regras";
import { sincronizarAcordos } from "./cobranca/sincronizar";

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

export type ResultadoDaConferencia = { error: string } | { ok: true; conferidas: number; puladas: number };

/**
 * Confere as contas marcadas (escolha 12A, 20/10/2026): o "Conferir" saiu da
 * linha para o "⋯" e para a barra das marcadas. A mesma regra da conta a
 * conta (`podeConferir`): só a provisória é conferida; a já conferida, paga
 * ou cancelada fica como está e conta nas puladas.
 */
export async function conferirContasEmLote(valores: string[]): Promise<ResultadoDaConferencia> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;
  const ids = idsDoLote(Array.isArray(valores) ? valores : []);
  if ("erro" in ids) return { error: ids.erro };

  const prisma = getPrisma();
  const provisorias = await prisma.financeEntry.findMany({
    where: { id: { in: ids }, tenantId, status: "PROVISORIO" },
    select: { id: true },
  });
  if (provisorias.length === 0) return { error: "Nenhuma das contas marcadas está a conferir." };

  // O status de novo no `where`: a que alguém conferiu ou pagou no meio-tempo
  // fica como está. O instante marca as que esta chamada conferiu, para a
  // auditoria registrar só elas.
  const agora = new Date();
  await prisma.financeEntry.updateMany({
    where: { id: { in: provisorias.map((c) => c.id) }, tenantId, status: "PROVISORIO" },
    data: { status: "CONFERIDO", reviewedById: ctx.userId ?? null, reviewedAt: agora },
  });
  const conferidas = await prisma.financeEntry.findMany({
    where: { id: { in: provisorias.map((c) => c.id) }, tenantId, status: "CONFERIDO", reviewedAt: agora },
    select: { id: true, counterparty: { select: { name: true } } },
  });

  for (const c of conferidas) {
    await logAudit({
      tenantId,
      userId: ctx.userId,
      action: "finance.review",
      entityType: "FinanceEntry",
      entityId: c.id,
      metadata: { contraparte: c.counterparty.name, emLote: true },
    });
  }

  revalidar();
  return { ok: true, conferidas: conferidas.length, puladas: ids.length - conferidas.length };
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
      /** A conta corrente prevista no título (lote D, 20/10): a janela já a traz marcada. */
      contaPrevistaId: string | null;
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
      bankAccountId: true,
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
    contaPrevistaId: conta.bankAccountId,
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

// ─── Baixa em lote (fila do BPO, 19/10) ──────────────────────────────────────
//
// As contas marcadas na tela, cada uma pelo saldo, num dia só — ver
// `baixa/lote.ts`. A janela pede o que vai entrar (`dadosDaBaixaEmLote`) e
// grava (`registrarPagamentosEmLote`).

export type ContaDoLote = {
  id: string;
  contraparteNome: string;
  empresaId: string;
  empresaNome: string;
  vencimentoKey: string;
  saldoCentavos: number;
};

export type DadosDoLote =
  | {
      ok: true;
      kind: "PAGAR" | "RECEBER";
      entram: ContaDoLote[];
      ficam: ForaDoLote[];
      /**
       * As empresas das contas que entram, com as contas bancárias de cada uma
       * e a prevista quando todas as contas dela no lote preveem a mesma.
       */
      empresas: { id: string; nome: string; contas: { id: string; nome: string }[]; contaPrevistaId: string | null }[];
    }
  | { ok: false; erro: string };

function idsDoLote(valores: unknown[]): string[] | { erro: string } {
  const ids = [...new Set(valores.map((v) => String(v ?? "")).filter(Boolean))];
  if (ids.length === 0) return { erro: "Marque ao menos uma conta." };
  if (ids.length > MAXIMO_DO_LOTE) return { erro: `No máximo ${MAXIMO_DO_LOTE} contas por lote.` };
  return ids;
}

/** As contas do lote, separadas no que entra e no que fica — a janela e a gravação leem igual. */
async function lerLote(tenantId: string, ids: string[]) {
  const linhas = await getPrisma().financeEntry.findMany({
    where: { id: { in: ids }, tenantId },
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      paidPrincipal: true,
      approvalStatus: true,
      dueDate: true,
      companyId: true,
      omieTitleId: true,
      omieMovementId: true,
      company: { select: { name: true, displayName: true, omieCutoverAt: true } },
      counterparty: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });
  const tipos = new Set(linhas.map((l) => l.kind));
  const separadas = separarLote(
    linhas.map((l) => ({
      id: l.id,
      contraparteNome: l.counterparty.name,
      empresaId: l.companyId,
      empresaNome: nomeExibicao(l.company),
      vencimentoKey: saoPauloParts(l.dueDate).dateKey,
      status: l.status,
      saldoCentavos: saldoEmAberto(centavosDeDecimal(l.amount), centavosDeDecimal(l.paidPrincipal)),
      bloqueio: presaAoOmie(l, l.company) ? MOTIVO_DO_OMIE.baixa : motivoDoBloqueioDeBaixa(l),
    }))
  );
  return { linhas, tipos, ...separadas };
}

/** O que a janela da baixa em lote mostra: as que entram, as que ficam e as contas bancárias. */
export async function dadosDaBaixaEmLote(valores: string[]): Promise<DadosDoLote> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { ok: false, erro: erro ?? "Não autenticado" };
  const ids = idsDoLote(Array.isArray(valores) ? valores : []);
  if ("erro" in ids) return { ok: false, erro: ids.erro };
  const lote = await lerLote(ctx.tenantId, ids);
  if (lote.linhas.length !== ids.length) return { ok: false, erro: "Alguma conta marcada não existe mais — atualize a tela." };
  if (lote.tipos.size > 1) return { ok: false, erro: "Marque só contas a pagar ou só contas a receber." };
  const empresas = [...new Map(lote.entram.map((c) => [c.empresaId, c.empresaNome])).entries()];
  const previstas = await getPrisma().financeEntry.findMany({
    where: { id: { in: lote.entram.map((c) => c.id) }, tenantId: ctx.tenantId },
    select: { companyId: true, bankAccountId: true },
  });
  return {
    ok: true,
    kind: lote.linhas[0]!.kind,
    entram: lote.entram.map(({ id, contraparteNome, empresaId, empresaNome, vencimentoKey, saldoCentavos }) => ({
      id,
      contraparteNome,
      empresaId,
      empresaNome,
      vencimentoKey,
      saldoCentavos,
    })),
    ficam: lote.ficam,
    empresas: await Promise.all(
      empresas.map(async ([id, nome]) => ({
        id,
        nome,
        contas: await contasDaEmpresa(ctx.tenantId, id),
        contaPrevistaId: contaPrevistaEmComum(previstas.filter((p) => p.companyId === id).map((p) => p.bankAccountId)),
      }))
    ),
  };
}

export type ResultadoDoLote =
  | { error: string }
  | { ok: true; baixadas: number; totalCentavos: number; recusadas: ForaDoLote[] };

/**
 * Baixa as contas marcadas pelo saldo de cada uma, no dia informado, com a
 * conta bancária da empresa de cada uma (`conta:<empresaId>`, opcional).
 *
 * Uma transação por conta: a que foi recusada — paga por outra pessoa no
 * meio-tempo, aprovação pendente — vai para `recusadas`, e as outras seguem.
 * O registro (`quitarConta`) relê o saldo com a conta travada, então a conta
 * que alguém pagou em parte enquanto a janela estava aberta é quitada pelo que
 * falta, e não pelo saldo que a janela mostrou.
 */
export async function registrarPagamentosEmLote(formData: FormData): Promise<ResultadoDoLote> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };
  const tenantId = ctx.tenantId;
  const ids = idsDoLote(formData.getAll("entryIds"));
  if ("erro" in ids) return { error: ids.erro };
  const dia = validarDiaDoLote(String(formData.get("data") ?? ""), saoPauloParts(new Date()).dateKey);
  if (!dia.ok) return { error: dia.erro };

  const lote = await lerLote(tenantId, ids);
  if (lote.linhas.length !== ids.length) return { error: "Alguma conta marcada não existe mais — atualize a tela." };
  if (lote.tipos.size > 1) return { error: "Marque só contas a pagar ou só contas a receber." };
  if (lote.entram.length === 0) return { error: "Nenhuma das contas marcadas pode ser baixada." };

  // A conta bancária de cada empresa, conferida: só conta ativa da própria empresa.
  const bancoDa = new Map<string, string | null>();
  for (const empresaId of new Set(lote.entram.map((c) => c.empresaId))) {
    const escolhida = String(formData.get(`conta:${empresaId}`) ?? "").trim() || null;
    if (escolhida) {
      const banco = await getPrisma().bankAccount.findFirst({ where: { id: escolhida, tenantId, companyId: empresaId, active: true }, select: { id: true } });
      if (!banco) return { error: "Conta bancária não encontrada na empresa — atualize a tela." };
    }
    bancoDa.set(empresaId, escolhida);
  }
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 255) || null;
  const paidAt = instanteDaData(dia.dataKey);

  const recusadas: ForaDoLote[] = [...lote.ficam];
  let baixadas = 0;
  let totalCentavos = 0;
  for (const c of lote.entram) {
    try {
      const b = await getPrisma().$transaction(async (tx) => {
        const gravada = await quitarConta(tx, {
          tenantId,
          entryId: c.id,
          paidAt,
          bankAccountId: bancoDa.get(c.empresaId) ?? null,
          note: observacao,
          origin: "MANUAL",
          userId: ctx.userId || null,
        });
        await sincronizarAcordos(tx, tenantId, [c.id]);
        return gravada;
      });
      baixadas++;
      totalCentavos += b.caixaCentavos;
      await logAudit({
        tenantId,
        userId: ctx.userId,
        action: "finance.pay",
        entityType: "FinanceEntry",
        entityId: c.id,
        metadata: {
          kind: lote.linhas[0]!.kind,
          contraparte: c.contraparteNome,
          pagoEm: dia.dataKey,
          valor: decimalDeCentavos(b.caixaCentavos),
          contaBancaria: bancoDa.get(c.empresaId) ?? null,
          baixa: b.paymentId,
          emLote: true,
        },
      });
    } catch (err) {
      if (!(err instanceof RecusaDaBaixa)) throw err;
      recusadas.push({ id: c.id, contraparteNome: c.contraparteNome, motivo: err.message });
    }
  }

  revalidar();
  return { ok: true, baixadas, totalCentavos, recusadas };
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
