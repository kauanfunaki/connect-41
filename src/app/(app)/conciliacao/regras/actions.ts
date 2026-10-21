"use server";

// Regras de conciliação (fila do BPO, 21/10): criar, editar, pausar e excluir;
// a prévia e o aplicar às pendentes; lançar uma linha pela regra; desfazer o
// que uma regra lançou. As regras puras estão em
// src/lib/financeiro/conciliacao/regras.ts; a gravação, em `regrasServidor.ts`.
//
// Como as outras ações da conciliação, tudo é conferido de novo aqui: a tela
// pode estar velha e a action é alcançável por POST direto.

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { logAudit } from "@/lib/audit";
import { decimalDeCentavos } from "@/lib/financeiro/manual";
import { categoriaDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { centroNaCriacao } from "@/lib/financeiro/centroDeCustoServidor";
import { projetoInformado } from "@/lib/financeiro/projetoServidor";
import { temExtrato } from "@/lib/financeiro/tiposDeConta";
import { RecusaDaBaixa } from "@/lib/financeiro/baixa/servidor";
import { empresaLidaDoOmie } from "@/lib/integracoes/omie/viradaServidor";
import { tipoDaRegra, validarRegra, type CamposDaRegra } from "@/lib/financeiro/conciliacao/regras";
import {
  desfazerLancamentoDaRegra,
  lancarLinhaPelaRegra,
  linhaDoTenant,
  prepararAcao,
  previaDaRegra,
  regraDoTenant,
  RecusaDoDesfazer,
  type ItemDaPrevia,
} from "@/lib/financeiro/conciliacao/regrasServidor";

const MODULE = "bpo_conciliacao";

/** Teto do "aplicar às pendentes" num clique — o mesmo da prévia. */
const MAXIMO_POR_VEZ = 500;

export type Resultado = { error: string } | { ok: true };

async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false as const, erro: "Não autenticado." };
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? getModuleDef(MODULE)!.sectorCode;
  if (!canActOnSector(ctx, setor)) return { ok: false as const, erro: "Sem permissão para conciliar." };
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) return { ok: false as const, erro: "Módulo não habilitado." };
  return { ok: true as const, ctx, tenantId: ctx.tenantId, userId: ctx.userId || null, prisma: getPrisma() };
}

function revalidar() {
  for (const p of ["/conciliacao", "/conciliacao/regras", "/pagar", "/receber", "/lancamentos", "/fluxo-de-caixa", "/dre", "/dre/economica", "/dre/analises"]) {
    revalidatePath(p);
  }
}

function texto(formData: FormData, k: string): string {
  const v = formData.get(k);
  return typeof v === "string" ? v : "";
}

// ─── Cadastro da regra ──────────────────────────────────────────────────────

export type ResultadoDaRegra = { error: string } | { ok: true; id: string; nova: boolean };

/**
 * Cria ou edita uma regra. A ação é conferida contra o cadastro da empresa
 * agora — a contraparte, a categoria do plano dela e do tipo certo, o centro,
 * o projeto e a conta com extrato. A regra em modo "lançar" se grava mesmo na
 * empresa ainda lida do Omie: lá ela só sugere até a virada (`decisaoDaLinha`).
 */
export async function salvarRegra(formData: FormData): Promise<ResultadoDaRegra> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };

  const id = texto(formData, "id").trim();
  const existente = id ? await regraDoTenant(c.prisma, c.tenantId, id) : null;
  if (id && !existente) return { error: "Regra não encontrada." };
  const companyId = existente?.companyId ?? texto(formData, "companyId").trim();
  const empresa = await c.prisma.company.findFirst({ where: { id: companyId, tenantId: c.tenantId }, select: { id: true } });
  if (!empresa) return { error: "Empresa não encontrada." };

  const campos: CamposDaRegra = {
    nome: texto(formData, "nome"),
    sentido: texto(formData, "sentido"),
    texto: texto(formData, "texto"),
    tipoDoValor: texto(formData, "tipoDoValor"),
    valor: texto(formData, "valor"),
    valorMinimo: texto(formData, "valorMinimo"),
    valorMaximo: texto(formData, "valorMaximo"),
    bankAccountId: texto(formData, "bankAccountId"),
    counterpartyId: texto(formData, "counterpartyId"),
    categoryId: texto(formData, "categoryId"),
    costCenterId: texto(formData, "costCenterId"),
    projectId: texto(formData, "projectId"),
    descricao: texto(formData, "descricao"),
    modo: texto(formData, "modo"),
  };
  const v = validarRegra(campos);
  if (!v.ok) return { error: v.erro };
  const r = v.regra;
  const kind = tipoDaRegra(r.sentido);

  const contraparte = await c.prisma.financeCounterparty.findFirst({
    where: { id: r.counterpartyId, tenantId: c.tenantId, companyId },
    select: { id: true, active: true, defaultCostCenterId: true },
  });
  if (!contraparte || !contraparte.active) return { error: "Contraparte não encontrada (ou inativa) nesta empresa." };
  if (r.categoryId) {
    const categoria = await c.prisma.financeCategory.findFirst({
      where: { ...categoriaDaEmpresa(c.tenantId, companyId, r.categoryId, kind), active: true },
      select: { id: true },
    });
    if (!categoria) return { error: `Categoria não encontrada para conta a ${kind === "PAGAR" ? "pagar" : "receber"}.` };
  }
  if (r.costCenterId) {
    const centro = await centroNaCriacao({ tenantId: c.tenantId, companyId, informadoId: r.costCenterId, padraoDaContraparteId: null });
    if (!centro.ok) return { error: centro.erro };
  }
  const projeto = await projetoInformado({ tenantId: c.tenantId, companyId, informadoId: r.projectId, atualId: existente?.projectId ?? null });
  if (!projeto.ok) return { error: projeto.erro };
  if (r.bankAccountId) {
    const conta = await c.prisma.bankAccount.findFirst({
      where: { id: r.bankAccountId, tenantId: c.tenantId, companyId },
      select: { type: true },
    });
    if (!conta || !temExtrato(conta.type)) return { error: "Conta bancária não encontrada nesta empresa (ou sem extrato)." };
  }

  const dados = {
    name: r.nome,
    direction: r.sentido,
    textContains: r.texto,
    minAmount: r.minCentavos === null ? null : decimalDeCentavos(r.minCentavos),
    maxAmount: r.maxCentavos === null ? null : decimalDeCentavos(r.maxCentavos),
    bankAccountId: r.bankAccountId,
    counterpartyId: r.counterpartyId,
    categoryId: r.categoryId,
    costCenterId: r.costCenterId,
    projectId: r.projectId,
    description: r.descricao,
    mode: r.modo,
  };
  const salva = existente
    ? await c.prisma.bankReconciliationRule.update({ where: { id: existente.id }, data: dados, select: { id: true } })
    : await c.prisma.bankReconciliationRule.create({
        data: { ...dados, tenantId: c.tenantId, companyId, createdById: c.userId },
        select: { id: true },
      });

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: existente ? "financeiro.bank_rule.updated" : "financeiro.bank_rule.created",
    entityType: "BankReconciliationRule",
    entityId: salva.id,
    metadata: { companyId, ...dados, minAmount: dados.minAmount?.toString() ?? null, maxAmount: dados.maxAmount?.toString() ?? null },
  });
  revalidar();
  return { ok: true, id: salva.id, nova: !existente };
}

/** Pausa ou retoma uma regra. Pausada não sugere nem lança. */
export async function alterarRegraAtiva(id: string, ativa: boolean): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const regra = await regraDoTenant(c.prisma, c.tenantId, id);
  if (!regra) return { error: "Regra não encontrada." };
  await c.prisma.bankReconciliationRule.updateMany({ where: { id, tenantId: c.tenantId }, data: { active: ativa } });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: ativa ? "financeiro.bank_rule.resumed" : "financeiro.bank_rule.paused",
    entityType: "BankReconciliationRule",
    entityId: id,
    metadata: { companyId: regra.companyId, nome: regra.nome },
  });
  revalidar();
  return { ok: true };
}

/**
 * Exclui a regra. O que ela já lançou fica — os lançamentos e o registro, com
 * o nome dela; para tirar um lançamento, desfaça no registro.
 */
export async function excluirRegra(id: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const regra = await regraDoTenant(c.prisma, c.tenantId, id);
  if (!regra) return { error: "Regra não encontrada." };
  await c.prisma.bankReconciliationRule.deleteMany({ where: { id, tenantId: c.tenantId } });
  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.bank_rule.deleted",
    entityType: "BankReconciliationRule",
    entityId: id,
    metadata: { companyId: regra.companyId, nome: regra.nome },
  });
  revalidar();
  return { ok: true };
}

// ─── Prévia e aplicar às pendentes ──────────────────────────────────────────

export type ResultadoDaPrevia = { error: string } | { ok: true; itens: ItemDaPrevia[]; limitado: boolean; lidaDoOmie: boolean };

/** As linhas pendentes que a regra pegaria agora. Não grava nada. */
export async function verPreviaDaRegra(id: string): Promise<ResultadoDaPrevia> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const regra = await regraDoTenant(c.prisma, c.tenantId, id);
  if (!regra) return { error: "Regra não encontrada." };
  const [previa, lidaDoOmie] = await Promise.all([previaDaRegra(c.tenantId, regra), empresaLidaDoOmie(c.tenantId, regra.companyId)]);
  return { ok: true, ...previa, lidaDoOmie };
}

export type ResultadoDaAplicacao = { error: string } | { ok: true; lancadas: number; recusas: string[] };

/**
 * Lança pela regra as linhas que a pessoa marcou na prévia — mesmo pausada:
 * marcar na prévia é a confirmação. Cada linha numa transação própria; a que
 * mudou no meio do caminho é pulada e dita, sem desfazer as outras.
 */
export async function aplicarRegra(id: string, transactionIds: string[]): Promise<ResultadoDaAplicacao> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  if (!Array.isArray(transactionIds) || transactionIds.length === 0) return { error: "Marque ao menos uma linha." };
  if (transactionIds.length > MAXIMO_POR_VEZ) return { error: `No máximo ${MAXIMO_POR_VEZ} linhas por vez.` };
  const regra = await regraDoTenant(c.prisma, c.tenantId, id);
  if (!regra) return { error: "Regra não encontrada." };
  const preparada = await prepararAcao(c.tenantId, regra);
  if (!preparada.ok) return { error: preparada.erro };

  let lancadas = 0;
  const recusas: string[] = [];
  for (const transactionId of [...new Set(transactionIds)]) {
    const linha = await linhaDoTenant(c.tenantId, transactionId);
    if (!linha) {
      recusas.push("Linha do extrato não encontrada.");
      continue;
    }
    const r = await lancarLinhaPelaRegra({ tenantId: c.tenantId, userId: c.userId, acao: preparada.acao, linha, automatico: false });
    if (r.ok) lancadas++;
    else recusas.push(r.erro);
  }

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.bank_rule.applied",
    entityType: "BankReconciliationRule",
    entityId: regra.id,
    metadata: { companyId: regra.companyId, marcadas: transactionIds.length, lancadas, recusas },
  });
  revalidar();
  return { ok: true, lancadas, recusas: [...new Set(recusas)] };
}

/** "Lançar pela regra" numa linha da conciliação: a pessoa confirmou a sugestão. */
export async function lancarPelaRegra(transactionId: string, ruleId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  const [regra, linha] = await Promise.all([regraDoTenant(c.prisma, c.tenantId, ruleId), linhaDoTenant(c.tenantId, transactionId)]);
  if (!regra) return { error: "Regra não encontrada." };
  if (!linha) return { error: "Transação não encontrada." };
  if (!regra.ativa) return { error: "Esta regra está pausada — retome-a na tela das regras." };
  const preparada = await prepararAcao(c.tenantId, regra);
  if (!preparada.ok) return { error: preparada.erro };
  const r = await lancarLinhaPelaRegra({ tenantId: c.tenantId, userId: c.userId, acao: preparada.acao, linha, automatico: false });
  if (!r.ok) return { error: r.erro };

  await logAudit({
    tenantId: c.tenantId,
    userId: c.ctx.userId,
    action: "financeiro.entry.created_by_bank_rule",
    entityType: "FinanceEntry",
    entityId: r.entryId,
    metadata: { companyId: regra.companyId, ruleId: regra.id, regra: regra.nome, transactionId },
  });
  revalidar();
  return { ok: true };
}

/** Desfaz o que uma regra lançou: cancela o lançamento e devolve a linha às pendentes. */
export async function desfazerLancamentoPelaRegra(applicationId: string): Promise<Resultado> {
  const c = await contexto();
  if (!c.ok) return { error: c.erro };
  try {
    const r = await c.prisma.$transaction((tx) => desfazerLancamentoDaRegra(tx, c.tenantId, applicationId, c.userId));
    await logAudit({
      tenantId: c.tenantId,
      userId: c.ctx.userId,
      action: "financeiro.bank_rule.undone",
      entityType: "BankRuleApplication",
      entityId: applicationId,
      metadata: r,
    });
  } catch (err) {
    if (err instanceof RecusaDoDesfazer || err instanceof RecusaDaBaixa) return { error: err.message };
    throw err;
  }
  revalidar();
  return { ok: true };
}
