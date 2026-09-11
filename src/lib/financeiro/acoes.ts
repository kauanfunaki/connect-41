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

const SECTOR = "bpo";

export type AcaoDeContaState = { error: string } | null;

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { erro: "Não autenticado" as const, ctx: null };
  if (!canActOnSector(ctx, SECTOR)) return { erro: "Sem permissão no BPO" as const, ctx: null };
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
      counterparty: { select: { name: true } },
    },
  });
}

function revalidar() {
  revalidatePath("/pagar");
  revalidatePath("/receber");
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

  // Meio-dia para a data não escorregar de dia ao atravessar o fuso — o mesmo
  // cuidado da contagem de dias úteis do societário.
  const pagoEm = new Date(`${bruto}T12:00:00-03:00`);

  const prisma = getPrisma();
  await prisma.financeEntry.update({
    where: { id: entryId },
    data: { status: "PAGO", paidAt: pagoEm },
  });

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

  const prisma = getPrisma();
  await prisma.financeEntry.update({
    where: { id: entryId },
    data: { status: "CONFERIDO", paidAt: null },
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
