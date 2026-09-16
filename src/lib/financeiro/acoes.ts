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
import { podeMarcarPago, podeConferir } from "./contas";
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

/**
 * Baixa: registra que o dinheiro saiu (ou entrou) naquele dia.
 *
 * A data vem de fora porque **baixa atrasada é comum** — alguém lança na
 * segunda o que pagou na sexta, e forçar "hoje" jogaria o pagamento na
 * competência errada do fluxo de caixa.
 *
 * Pagar direto do `PROVISORIO` é permitido: pagar implica ter conferido, e
 * exigir dois cliques para o mesmo ato só faria a pessoa clicar dois.
 */
export async function marcarComoPago(
  entryId: string,
  dataISO: string
): Promise<AcaoDeContaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const conta = await contaDoTenant(entryId, ctx.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };

  const bruto = (dataISO || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return { error: "Informe a data do pagamento." };

  const hojeKey = saoPauloParts(new Date()).dateKey;
  const veredito = podeMarcarPago(conta, bruto, hojeKey);
  if (!veredito.pode) return { error: veredito.motivo };
  // Aprovação por alçada: aguardando ou reprovada não sai do caixa.
  const bloqueio = motivoDoBloqueioDeBaixa(conta);
  if (bloqueio) return { error: bloqueio };

  // Meio-dia para a data não escorregar de dia ao atravessar o fuso — o mesmo
  // cuidado da contagem de dias úteis do societário.
  const pagoEm = new Date(`${bruto}T12:00:00-03:00`);

  // Condicionado ao estado lido: se a conta foi reenviada para aprovação (ou
  // paga por outra pessoa, ou cancelada) entre a leitura e aqui, a baixa não
  // passa por cima.
  //
  // Na mesma transação, o acordo de que a conta é parcela: a última parcela
  // paga torna o acordo cumprido junto com a baixa.
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  const baixada = await prisma.$transaction(async (tx) => {
    const r = await tx.financeEntry.updateMany({
      where: {
        id: entryId,
        tenantId,
        status: { in: ["PROVISORIO", "CONFERIDO"] },
        paidAt: null,
        approvalStatus: { in: ["NAO_REQUER", "APROVADO"] },
      },
      data: { status: "PAGO", paidAt: pagoEm },
    });
    if (r.count === 1) await sincronizarAcordos(tx, tenantId, [entryId]);
    return r;
  });
  if (baixada.count !== 1) return { error: "A conta acabou de mudar (aprovação, baixa ou cancelamento) — atualize a tela." };

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "finance.pay",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: {
      kind: conta.kind,
      valor: conta.amount.toString(),
      pagoEm: bruto,
      contraparte: conta.counterparty.name,
    },
  });

  revalidar();
  return null;
}

/**
 * Desfaz a baixa.
 *
 * Existe porque a alternativa seria deixar corrigir a data por cima, e
 * sobrescrever em silêncio a data real do pagamento — que é justamente o dado
 * que a conciliação vai usar para casar com o extrato. Desfazer e refazer deixa
 * rastro no AuditLog; editar por cima, não.
 *
 * Volta para `CONFERIDO`, não para `PROVISORIO`: alguém já olhou esta conta.
 */
export async function desfazerPagamento(entryId: string): Promise<AcaoDeContaState> {
  const { erro, ctx } = await contexto();
  if (erro || !ctx?.tenantId) return { error: erro ?? "Não autenticado" };

  const conta = await contaDoTenant(entryId, ctx.tenantId);
  if (!conta) return { error: "Lançamento não encontrado." };
  if (conta.status !== "PAGO" && conta.paidAt === null) {
    return { error: "Esta conta não está paga." };
  }

  // Parcela de acordo cumprido que deixa de estar paga devolve o acordo a ativo.
  const prisma = getPrisma();
  const tenantId = ctx.tenantId;
  await prisma.$transaction(async (tx) => {
    await tx.financeEntry.update({
      where: { id: entryId },
      data: { status: "CONFERIDO", paidAt: null },
    });
    await sincronizarAcordos(tx, tenantId, [entryId]);
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "finance.unpay",
    entityType: "FinanceEntry",
    entityId: entryId,
    metadata: { contraparte: conta.counterparty.name },
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
