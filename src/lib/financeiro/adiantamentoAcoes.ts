"use server";

// Adiantar e desfazer o adiantamento (lote D, 20/10) — a janela "Novo
// adiantamento" de Contas a pagar e de Contas a receber. As regras moram em
// `adiantamento.ts`; a conta e os saldos, em `adiantamentoServidor.ts`.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { saoPauloParts } from "@/lib/agenda";
import { podeEditarOTipo } from "./acessoDaConta";
import { centavosDeDecimal } from "./contas";
import { centavosDeTexto, decimalDeCentavos } from "./manual";
import { competenciaDoInstante, instanteDaData } from "./periodo";
import { quitarConta } from "./baixa/servidor";
import { categoriaDeTransferencia } from "./conciliacao/transferenciaServidor";
import { descricaoDoAdiantamento, ehContaDeAdiantamento, TIPOS_DE_ADIANTAMENTO, tipoDoAdiantamento, validarNovoAdiantamento } from "./adiantamento";
import { contaDeAdiantamento, disponivelDoAdiantamento } from "./adiantamentoServidor";

type Opcao = { id: string; nome: string };

export type DadosParaAdiantar =
  | { ok: true; contrapartes: Opcao[]; contas: Opcao[]; hojeKey: string }
  | { ok: false; erro: string };

/** O que a janela precisa: os fornecedores (ou clientes) e as contas de banco da empresa. */
export async function dadosParaAdiantar(companyId: string, kind: "PAGAR" | "RECEBER"): Promise<DadosParaAdiantar> {
  const acesso = await podeEditarOTipo(kind);
  if (!acesso.ctx) return { ok: false, erro: acesso.erro ?? "Sem permissão." };
  const tenantId = acesso.ctx.tenantId;
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } });
  if (!empresa) return { ok: false, erro: "Escolha a empresa antes de adiantar." };
  const [contrapartes, contas] = await Promise.all([
    prisma.financeCounterparty.findMany({ where: { tenantId, companyId, active: true }, select: { id: true, name: true, document: true }, orderBy: { name: "asc" } }),
    prisma.bankAccount.findMany({
      where: { tenantId, companyId, active: true, type: { notIn: [...TIPOS_DE_ADIANTAMENTO] } },
      select: { id: true, nickname: true, accountNumber: true },
      orderBy: { nickname: "asc" },
    }),
  ]);
  return {
    ok: true,
    contrapartes: contrapartes.map((c) => ({ id: c.id, nome: c.document ? `${c.name} · ${c.document}` : c.name })),
    contas: contas.map((c) => ({ id: c.id, nome: `${c.nickname} ${c.accountNumber}` })),
    hojeKey: saoPauloParts(new Date()).dateKey,
  };
}

function revalidar() {
  for (const p of ["/pagar", "/receber", "/fluxo-de-caixa", "/conciliacao", "/dre"]) revalidatePath(p);
}

/**
 * Adianta: tira o dinheiro do banco e põe na conta de adiantamento da empresa,
 * para o fornecedor (ou do cliente). O par de lançamentos nasce pago, na
 * categoria de transferência — fora da DRE —, com a contraparte de quem
 * recebeu (ou pagou) o adiantamento.
 */
export async function registrarAdiantamento(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const kind: "PAGAR" | "RECEBER" = texto("kind") === "RECEBER" ? "RECEBER" : "PAGAR";
  const acesso = await podeEditarOTipo(kind);
  if (!acesso.ctx) return { error: acesso.erro ?? "Sem permissão." };
  const ctx = acesso.ctx;
  const tenantId = ctx.tenantId;
  const companyId = texto("companyId");
  const prisma = getPrisma();

  const [contraparte, banco] = await Promise.all([
    prisma.financeCounterparty.findFirst({ where: { id: texto("counterpartyId"), tenantId, companyId }, select: { id: true, name: true } }),
    prisma.bankAccount.findFirst({ where: { id: texto("contaBancariaId"), tenantId, companyId, active: true }, select: { id: true, type: true } }),
  ]);
  if (!contraparte) return { error: kind === "PAGAR" ? "Escolha o fornecedor." : "Escolha o cliente." };
  if (!banco || ehContaDeAdiantamento(banco.type)) return { error: kind === "PAGAR" ? "Escolha a conta de onde saiu o dinheiro." : "Escolha a conta onde o dinheiro entrou." };

  const v = validarNovoAdiantamento({ valorCentavos: centavosDeTexto(texto("valor")), data: texto("data"), hojeKey: saoPauloParts(new Date()).dateKey });
  if (!v.ok) return { error: v.erro };
  const centavos = centavosDeTexto(texto("valor"))!;
  const tipo = tipoDoAdiantamento(kind);
  const instante = instanteDaData(v.dataKey);
  const descricao = descricaoDoAdiantamento(tipo, contraparte.name, texto("observacao").slice(0, 120) || null);
  const transferId = randomUUID();

  const pontaDoBanco = await prisma.$transaction(async (tx) => {
    const adiantamento = await contaDeAdiantamento(tx, tenantId, companyId, tipo);
    let doBanco = "";
    // A ponta do banco tem o sentido do adiantamento; a da conta de adiantamento, o contrário.
    const pontas: { kind: "PAGAR" | "RECEBER"; conta: string }[] = [
      { kind, conta: banco.id },
      { kind: kind === "PAGAR" ? "RECEBER" : "PAGAR", conta: adiantamento },
    ];
    for (const ponta of pontas) {
      const criada = await tx.financeEntry.create({
        data: {
          tenantId,
          companyId,
          kind: ponta.kind,
          status: "CONFERIDO",
          counterpartyId: contraparte.id,
          categoryId: await categoriaDeTransferencia(tx, tenantId, companyId, ponta.kind),
          competence: competenciaDoInstante(instante),
          dueDate: instante,
          amount: decimalDeCentavos(centavos),
          description: descricao,
          transferId,
          createdById: ctx.userId || null,
          reviewedById: ctx.userId || null,
          reviewedAt: new Date(),
        },
        select: { id: true },
      });
      await quitarConta(tx, { tenantId, entryId: criada.id, paidAt: instante, bankAccountId: ponta.conta, origin: "TRANSFERENCIA", userId: ctx.userId || null });
      if (ponta.conta === banco.id) doBanco = criada.id;
    }
    return doBanco;
  });

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "finance.advance",
    entityType: "FinanceEntry",
    entityId: pontaDoBanco,
    metadata: { kind, contraparte: contraparte.name, valor: decimalDeCentavos(centavos), data: v.dataKey },
  });
  revalidar();
  return { ok: true };
}

/**
 * Desfaz um adiantamento lançado por engano: cancela as duas pontas e apaga as
 * baixas delas. Recusa a ponta do banco já conciliada (desfaz-se na
 * conciliação) e o adiantamento que já foi usado — tirá-lo deixaria o
 * disponível de quem o recebeu negativo.
 */
export async function desfazerAdiantamento(transferId: string): Promise<{ error: string } | { ok: true }> {
  const prisma = getPrisma();
  const pontas = await prisma.financeEntry.findMany({
    where: { transferId, status: { not: "CANCELADO" } },
    select: {
      id: true,
      tenantId: true,
      companyId: true,
      kind: true,
      amount: true,
      counterpartyId: true,
      counterparty: { select: { name: true } },
      payments: { select: { id: true, bankMatch: { select: { id: true } }, bankAccount: { select: { type: true } } } },
    },
  });
  const naConta = pontas.find((p) => p.payments.some((b) => ehContaDeAdiantamento(b.bankAccount?.type)));
  const noBanco = pontas.find((p) => p !== naConta);
  if (pontas.length !== 2 || !naConta || !noBanco) return { error: "Adiantamento não encontrado — atualize a tela." };
  const acesso = await podeEditarOTipo(noBanco.kind);
  if (!acesso.ctx || acesso.ctx.tenantId !== noBanco.tenantId) return { error: acesso.erro ?? "Adiantamento não encontrado." };
  const ctx = acesso.ctx;
  if (noBanco.payments.some((b) => b.bankMatch)) return { error: "A saída do banco já foi conciliada com o extrato — desfaça a conciliação antes." };

  const tipo = tipoDoAdiantamento(noBanco.kind);
  const valor = centavosDeDecimal(noBanco.amount);
  const recusa = await prisma.$transaction(async (tx) => {
    const disponivel = await disponivelDoAdiantamento(tx, noBanco.tenantId, noBanco.companyId, tipo, noBanco.counterpartyId);
    if (disponivel - valor < 0) return "Parte deste adiantamento já pagou uma conta — desfaça aquela baixa antes.";
    await tx.financeEntryPayment.deleteMany({ where: { entryId: { in: [naConta.id, noBanco.id] } } });
    await tx.financeEntry.updateMany({
      where: { id: { in: [naConta.id, noBanco.id] } },
      data: { status: "CANCELADO", closeReason: "CANCELADO", paidAt: null, paidPrincipal: "0" },
    });
    return null;
  });
  if (recusa) return { error: recusa };

  await logAudit({
    tenantId: noBanco.tenantId,
    userId: ctx.userId,
    action: "finance.advance_undone",
    entityType: "FinanceEntry",
    entityId: noBanco.id,
    metadata: { kind: noBanco.kind, contraparte: noBanco.counterparty.name, valor: decimalDeCentavos(valor) },
  });
  revalidar();
  return { ok: true };
}
