"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import {
  agenciaSchema,
  classificacaoManualSchema,
  contaSchema,
  contraparteSchema,
  ehUuid,
  primeiroErro,
  processarNeoSchema,
  regraSchema,
} from "@/lib/contabil-core/entradas";
import {
  criarConta,
  editarConta,
  excluirConta,
  ligarEmpresa,
  mudarAtivaDaAgencia,
  mudarAtivaDaRegra,
  salvarAgencia,
  salvarContraparte,
  salvarRegra,
} from "@/lib/contabil-core/servidor/cadastros";
import { desfazerImportacao } from "@/lib/contabil-core/servidor/importacao";
import { cancelarClassificacao, classificarManual, liberarParaAutomatico, processarNeo, type ResultadoDoNeo, type ResultadoManual } from "@/lib/contabil-core/servidor/neo";

// As ações do Contábil Core (Fase 2, 09/11/2026). Trabalhar (cadastrar regra e contraparte,
// classificar, cancelar uma classificação) é "agir" no setor. Mexer na estrutura da empresa — pôr a
// empresa no Contábil Core, plano de contas, contas bancárias e desfazer uma importação inteira — é de
// quem coordena ("gerir"). Toda entrada passa por `entradas.ts`, e todo serviço confere o tenant.

type Retorno<T = object> = ({ ok: true } & T) | { error: string };

const SEM_ACESSO = "Sem acesso ao Contábil Core.";
const ROTA = "/contabil-core";

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function contexto(nivel: "agir" | "gerir") {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) return null;
  const pode = nivel === "gerir" ? await podeNoModulo(ctx, "contabil_core", "gerir") : await podeNoModulo(ctx, "contabil_core", "agir");
  return pode ? { tenantId: ctx.tenantId, userId: ctx.userId } : null;
}

function id(v: unknown): string | null {
  return ehUuid(v) ? v.toLowerCase() : null;
}

// ─── Empresas e estrutura (gerir) ─────────────────────────────────────────

export async function ligarEmpresaAction(form: unknown): Promise<Retorno<{ id: string }>> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const f = objeto(form);
  if (typeof f.companyId !== "string" || !f.companyId) return { error: "Escolha a empresa." };
  const r = await ligarEmpresa(c.tenantId, f.companyId, String(f.regime ?? ""));
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.empresa.ligada", entityType: "CoreEmpresa", entityId: r.valor.id, metadata: { nome: r.valor.nome } });
  revalidatePath(ROTA);
  return { ok: true, id: r.valor.id };
}

export async function salvarContaAction(empresaId: unknown, contaId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const v = contaSchema.safeParse(objeto(form));
  if (!v.success) return { error: primeiroErro(v.error) };
  const conta = contaId ? id(contaId) : null;
  const r = conta ? await editarConta(c.tenantId, e, conta, v.data) : await criarConta(c.tenantId, e, v.data);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: conta ? "contabil.core.conta.editada" : "contabil.core.conta.criada",
    entityType: "CorePlanoConta", entityId: conta ?? ("id" in r.valor ? String(r.valor.id) : undefined), metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function excluirContaAction(empresaId: unknown, contaId: unknown): Promise<Retorno> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const conta = id(contaId);
  if (!e || !conta) return { error: "Conta não informada." };
  const r = await excluirConta(c.tenantId, e, conta);
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.conta.excluida", entityType: "CorePlanoConta", entityId: conta, metadata: { nome: r.valor.nome } });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function salvarAgenciaAction(empresaId: unknown, agenciaId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const v = agenciaSchema.safeParse(objeto(form));
  if (!v.success) return { error: primeiroErro(v.error) };
  const agencia = agenciaId ? id(agenciaId) : null;
  const r = await salvarAgencia(c.tenantId, e, agencia, v.data);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: agencia ? "contabil.core.agencia.editada" : "contabil.core.agencia.criada",
    entityType: "CoreAgencia", entityId: r.valor.id, metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function mudarAtivaDaAgenciaAction(empresaId: unknown, agenciaId: unknown, ativa: boolean): Promise<Retorno> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const a = id(agenciaId);
  if (!e || !a) return { error: "Conta bancária não informada." };
  const r = await mudarAtivaDaAgencia(c.tenantId, e, a, ativa === true);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: ativa ? "contabil.core.agencia.reativada" : "contabil.core.agencia.inativada",
    entityType: "CoreAgencia", entityId: a, metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function desfazerImportacaoAction(empresaId: unknown, importacaoId: unknown, motivo: unknown): Promise<Retorno<{ transacoes: number; lancamentos: number }>> {
  const c = await contexto("gerir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const i = id(importacaoId);
  if (!e || !i) return { error: "Importação não informada." };
  const r = await desfazerImportacao(c.tenantId, c.userId, e, i, String(motivo ?? "").slice(0, 300));
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: "contabil.core.importacao.desfeita", entityType: "CoreImportacao", entityId: i,
    metadata: { nome: r.valor.nome, motivo: String(motivo ?? "").slice(0, 300), transacoes: r.valor.transacoes, lancamentos: r.valor.lancamentos },
  });
  revalidatePath(ROTA);
  return { ok: true, transacoes: r.valor.transacoes, lancamentos: r.valor.lancamentos };
}

// ─── Trabalho do dia (agir) ───────────────────────────────────────────────

export async function salvarContraparteAction(empresaId: unknown, contraparteId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const f = objeto(form);
  const v = contraparteSchema.safeParse(f);
  if (!v.success) return { error: primeiroErro(v.error) };
  const cp = contraparteId ? id(contraparteId) : null;
  const r = await salvarContraparte(c.tenantId, c.userId, e, cp, v.data, f.ativa !== false && f.ativa !== "false");
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: cp ? "contabil.core.contraparte.editada" : "contabil.core.contraparte.criada",
    entityType: "CoreContraparte", entityId: r.valor.id, metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function salvarRegraAction(empresaId: unknown, regraId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const v = regraSchema.safeParse(objeto(form));
  if (!v.success) return { error: primeiroErro(v.error) };
  const regra = regraId ? id(regraId) : null;
  const r = await salvarRegra(c.tenantId, e, regra, v.data);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: regra ? "contabil.core.regra.editada" : "contabil.core.regra.criada",
    entityType: "CoreRegra", entityId: r.valor.id, metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function mudarAtivaDaRegraAction(empresaId: unknown, regraId: unknown, ativa: boolean): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const r0 = id(regraId);
  if (!e || !r0) return { error: "Regra não informada." };
  const r = await mudarAtivaDaRegra(c.tenantId, e, r0, ativa === true);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: ativa ? "contabil.core.regra.reativada" : "contabil.core.regra.desativada",
    entityType: "CoreRegra", entityId: r0, metadata: { nome: r.valor.nome },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function processarNeoAction(empresaId: unknown, form: unknown): Promise<Retorno<{ resultado: ResultadoDoNeo }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const v = processarNeoSchema.safeParse(objeto(form));
  if (!v.success) return { error: primeiroErro(v.error) };
  const r = await processarNeo(c.tenantId, e, { agenciaId: v.data.agenciaId, mes: v.data.mes });
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: "contabil.core.neo.processado", entityType: "CoreEmpresa", entityId: e,
    metadata: { mes: v.data.mes, ...r.valor },
  });
  revalidatePath(ROTA);
  return { ok: true, resultado: r.valor };
}

export async function classificarManualAction(empresaId: unknown, form: unknown): Promise<Retorno<{ resultado: ResultadoManual }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const v = classificacaoManualSchema.safeParse(objeto(form));
  if (!v.success) return { error: primeiroErro(v.error) };
  const r = await classificarManual(c.tenantId, e, v.data);
  if (!r.ok) return { error: r.erro };
  if (r.valor.classificadas.length) {
    // Uma linha por lote (até 200 transações), com os ids: a trilha fica completa sem 200 linhas na auditoria.
    await logAudit({
      tenantId: c.tenantId, userId: c.userId, action: "contabil.core.neo.classificacao_manual", entityType: "CoreEmpresa", entityId: e,
      metadata: { contaId: v.data.contaId, historico: v.data.manterHistorico ? "(o do banco)" : v.data.descricao, transacoes: r.valor.classificadas },
    });
  }
  revalidatePath(ROTA);
  return { ok: true, resultado: r.valor };
}

export async function cancelarClassificacaoAction(empresaId: unknown, transacaoId: unknown, motivo: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const t = id(transacaoId);
  const texto = String(motivo ?? "").trim().slice(0, 300);
  if (!e || !t) return { error: "Transação não informada." };
  if (texto.length < 3) return { error: "Diga por que a classificação está sendo desfeita." };
  const r = await cancelarClassificacao(c.tenantId, c.userId, e, t, texto);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: c.tenantId, userId: c.userId, action: "contabil.core.lancamento.cancelado", entityType: "CoreTransacao", entityId: t,
    metadata: { nome: r.valor.historico, motivo: texto, partidas: r.valor.partidas },
  });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function liberarParaAutomaticoAction(empresaId: unknown, transacaoId: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const t = id(transacaoId);
  if (!e || !t) return { error: "Transação não informada." };
  const r = await liberarParaAutomatico(c.tenantId, e, t);
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.neo.liberada", entityType: "CoreTransacao", entityId: t, metadata: { nome: r.valor.historico } });
  revalidatePath(ROTA);
  return { ok: true };
}
