"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { previaDasNotasOmie, salvarContaOmie, testarContaOmie } from "@/lib/integracoes/omie/contas";
import { mensagemDaImportacao } from "@/lib/integracoes/omie/notas";
import { sincronizarNotasDaEmpresa } from "@/lib/integracoes/omie/sincronizacao";
import { sincronizarFinanceiroDaEmpresa } from "@/lib/integracoes/omie/sincronizacaoFinanceiro";
import { mensagemDoFinanceiro } from "@/lib/integracoes/omie/financeiro";
import { instanciaDoFinanceiro } from "@/lib/integracoes/omie/contas";
import { podeVirar } from "@/lib/integracoes/omie/virada";
import { getPrisma } from "@/lib/prisma";
import { recusaDoFoco } from "@/lib/empresas/focoServidor";

type Resultado = { error: string } | { ok: true; mensagem?: string };

// Credencial de sistema de terceiro é configuração do cliente inteiro — mesmo
// critério de `salvarConexao`: só quem administra o tenant.
async function contexto() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  if (!isFullWrite(ctx.role)) return null;
  return ctx;
}

export async function salvarContaOmieAction(dados: { companyId: string; appKey: string; appSecret: string }): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  if (!dados.companyId) return { error: "Escolha a empresa." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [dados.companyId]);
  if (foraDoFoco) return { error: foraDoFoco };
  if (!dados.appKey.trim()) return { error: "Informe a App Key." };
  const r = await salvarContaOmie({ tenantId: ctx.tenantId!, ...dados });
  if (!r.ok) return { error: r.erro };
  // Nunca o valor da chave no log — só que a conta da empresa mudou.
  await logAudit({ tenantId: ctx.tenantId!, userId: ctx.userId, action: "integration.omie.conta", entityType: "Company", entityId: dados.companyId });
  revalidatePath("/admin/integracoes");
  return { ok: true };
}

export async function testarContaOmieAction(companyId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  const r = await testarContaOmie(ctx.tenantId!, companyId);
  revalidatePath("/admin/integracoes");
  if (!r.ok) return { error: r.erro };
  const e = r.empresa;
  return { ok: true, mensagem: e ? `Conectado: ${e.razaoSocial} — CNPJ confere.` : "Conectado." };
}

/** Prévia das notas da conta — só leitura, nada é gravado (Fase 1a). */
export async function previaDasNotasOmieAction(companyId: string) {
  const ctx = await contexto();
  if (!ctx) return { erro: "Sem permissão para configurar integrações." };
  return previaDasNotasOmie(ctx.tenantId!, companyId);
}

/**
 * Lê agora as notas emitidas da conta e grava no acervo (Fase 1b). Só leitura
 * do lado do Omie. Conta grande continua de onde parou na próxima leitura.
 */
export async function importarNotasOmieAction(companyId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só grava nele.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { error: foraDoFoco };
  const r = await sincronizarNotasDaEmpresa(ctx.tenantId!, companyId, "MANUAL");
  revalidatePath("/admin/integracoes");
  if (!r.ok) return { error: r.erro };
  return { ok: true, mensagem: mensagemDaImportacao(r.counters) };
}

/**
 * Contas a pagar e a receber do Omie da empresa. Com `gravar: false` é a
 * prévia: lê tudo e só conta o que entraria — nada é gravado. A primeira
 * gravação é sempre daqui; depois o cron mantém atualizado.
 */
export async function contasDoOmieAction(companyId: string, gravar: boolean): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  // Com foco (21/10/2026), gravar só nele; a prévia (`gravar: false`) não grava e fica livre.
  if (gravar) {
    const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
    if (foraDoFoco) return { error: foraDoFoco };
  }
  const r = await sincronizarFinanceiroDaEmpresa(ctx.tenantId!, companyId, "MANUAL", { gravar });
  if (!r.ok) return { error: r.erro };
  if (gravar) {
    await logAudit({
      tenantId: ctx.tenantId!,
      userId: ctx.userId,
      action: "integration.omie.financeiro",
      entityType: "Company",
      entityId: companyId,
      metadata: r.counters,
    });
    for (const p of ["/admin/integracoes", "/pagar", "/receber", "/dre", "/dre/economica", "/fluxo-de-caixa", "/cadastros-financeiros"]) revalidatePath(p);
  }
  return { ok: true, mensagem: mensagemDoFinanceiro(r.counters, r.gravou) };
}

const TELAS_DO_FINANCEIRO = ["/admin/integracoes", "/pagar", "/receber", "/lancamentos", "/conciliacao", "/dre", "/dre/economica", "/fluxo-de-caixa"];

/**
 * A virada da empresa do Omie para o Connect (lote E da fila do BPO, 20/10).
 *
 * 1. A última leitura das contas do Omie, para o Connect partir de onde o Omie
 *    está. Ela roda um bloco de páginas por vez; se não chegou ao fim, a
 *    virada espera (`podeVirar`) — a leitura continua sozinha nas próximas
 *    rodadas, e a pessoa tenta de novo.
 * 2. A leitura do financeiro desliga, e a empresa ganha a data da virada —
 *    juntos, numa transação, e só se ninguém virou antes.
 *
 * Daí em diante o Connect é a fonte: as contas que vieram do Omie se editam,
 * pagam e cancelam aqui, e a leitura não roda mais para esta empresa. A
 * leitura das notas emitidas no Omie continua: é outra linha, e não mexe no
 * financeiro.
 */
export async function virarParaOConnectAction(companyId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx) return { error: "Sem permissão para configurar integrações." };
  const tenantId = ctx.tenantId!;
  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { omieCutoverAt: true } });
  if (!empresa) return { error: "Empresa não encontrada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só vira a empresa dele.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { error: foraDoFoco };
  const progresso = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(companyId) } },
    select: { id: true },
  });
  const antes = podeVirar({ viradaEm: empresa.omieCutoverAt, importouAsContas: Boolean(progresso), leituraPendente: false });
  if (!antes.pode) return { error: antes.motivo };

  let leitura: Record<string, number> | null = null;
  if (progresso) {
    const r = await sincronizarFinanceiroDaEmpresa(tenantId, companyId, "MANUAL", { gravar: true });
    if (!r.ok) return { error: `A última leitura do Omie falhou, e a virada não foi feita: ${r.erro}` };
    leitura = r.counters ?? null;
    const depois = await prisma.tenantIntegration.findUnique({ where: { id: progresso.id }, select: { cursor: true } });
    const veredito = podeVirar({ viradaEm: null, importouAsContas: true, leituraPendente: Boolean(depois?.cursor) });
    if (!veredito.pode) return { error: veredito.motivo };
  }

  const viradaEm = new Date();
  const virou = await prisma.$transaction(async (tx) => {
    const r = await tx.company.updateMany({ where: { id: companyId, tenantId, omieCutoverAt: null }, data: { omieCutoverAt: viradaEm } });
    if (r.count !== 1) return false;
    if (progresso) await tx.tenantIntegration.update({ where: { id: progresso.id }, data: { enabled: false } });
    return true;
  });
  if (!virou) return { error: "Esta empresa já virou para o Connect." };

  await logAudit({
    tenantId,
    userId: ctx.userId,
    action: "integration.omie.virada",
    entityType: "Company",
    entityId: companyId,
    metadata: { ultimaLeitura: leitura },
  });
  for (const p of TELAS_DO_FINANCEIRO) revalidatePath(p);
  return {
    ok: true,
    mensagem: "Virada feita: o Connect passou a ser a fonte das contas desta empresa, e a leitura das contas do Omie foi desligada. As notas emitidas no Omie continuam entrando no acervo.",
  };
}

/**
 * Desfaz a virada — só o Super Admin, para o engano. A leitura volta a ligar,
 * e a próxima reescreve, nas contas que vieram do Omie, o que o BPO mudou no
 * Connect desde a virada; a baixa feita aqui continua valendo (o espelho a
 * guarda), mas fica fora do Omie.
 */
export async function desfazerViradaAction(companyId: string): Promise<Resultado> {
  const ctx = await contexto();
  if (!ctx || ctx.role !== "SUPER_ADMIN") return { error: "Só o Super Admin desfaz a virada." };
  // Uma empresa por vez no BPO (21/10/2026): com foco, só desfaz a do grupo dele.
  const foraDoFoco = await recusaDoFoco(ctx, [companyId]);
  if (foraDoFoco) return { error: foraDoFoco };
  const tenantId = ctx.tenantId!;
  const prisma = getPrisma();
  const desfez = await prisma.$transaction(async (tx) => {
    const r = await tx.company.updateMany({ where: { id: companyId, tenantId, omieCutoverAt: { not: null } }, data: { omieCutoverAt: null } });
    if (r.count !== 1) return false;
    await tx.tenantIntegration.updateMany({
      where: { tenantId, integrationCode: "omie", instanceKey: instanciaDoFinanceiro(companyId) },
      data: { enabled: true },
    });
    return true;
  });
  if (!desfez) return { error: "Esta empresa não está virada." };
  await logAudit({ tenantId, userId: ctx.userId, action: "integration.omie.virada_desfeita", entityType: "Company", entityId: companyId });
  for (const p of TELAS_DO_FINANCEIRO) revalidatePath(p);
  return { ok: true, mensagem: "Virada desfeita: as contas desta empresa voltam a ser lidas do Omie na próxima rodada." };
}

