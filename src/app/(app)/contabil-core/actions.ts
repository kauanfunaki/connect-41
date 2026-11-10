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
import {
  alterarComposicao,
  classificarComRegra,
  criarRegraEAplicar,
  obterComposicao,
  reclassificar,
  simularRegra,
  type Composicao,
  type ResultadoComRegra,
  type Simulacao,
} from "@/lib/contabil-core/servidor/neoAvancado";
import { valorDoComponente } from "@/lib/contabil-core/motor/fila";

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

// ─── Fase 3: reclassificar, compor, simular e classificar criando a regra ─

export async function reclassificarAction(empresaId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const f = objeto(form);
  const t = id(f.transacaoId);
  const conta = id(f.contaId);
  const descricao = String(f.descricao ?? "").trim().slice(0, 500);
  const motivo = String(f.motivo ?? "").trim().slice(0, 300);
  if (!e || !t) return { error: "Transação não informada." };
  if (!conta) return { error: "Escolha a conta contábil." };
  if (descricao.length < 2) return { error: "Informe o histórico do lançamento." };
  if (motivo.length < 3) return { error: "Diga por que a classificação está sendo trocada." };
  const r = await reclassificar(c.tenantId, c.userId, e, { transacaoId: t, contaId: conta, descricao, motivo });
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.lancamento.reclassificado", entityType: "CoreTransacao", entityId: t, metadata: { nome: r.valor.historico, contaId: conta, historico: descricao, motivo } });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function obterComposicaoAction(empresaId: unknown, transacaoId: unknown): Promise<Retorno<{ composicao: Composicao }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const t = id(transacaoId);
  if (!e || !t) return { error: "Transação não informada." };
  const r = await obterComposicao(c.tenantId, e, t);
  return r.ok ? { ok: true, composicao: r.valor } : { error: r.erro };
}

export async function alterarComposicaoAction(empresaId: unknown, form: unknown): Promise<Retorno> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const f = objeto(form);
  const t = id(f.transacaoId);
  const vigente = id(f.lancamentoVigenteId);
  const motivo = String(f.motivo ?? "").trim().slice(0, 300);
  if (!e || !t || !vigente) return { error: "Transação não informada." };
  if (motivo.length < 3) return { error: "Diga por que a composição está sendo alterada." };
  const brutos = Array.isArray(f.componentes) ? f.componentes.slice(0, 50) : [];
  const componentes = [];
  for (const b of brutos) {
    const x = objeto(b);
    const conta = id(x.contaId);
    const valor = valorDoComponente(String(x.valor ?? ""));
    if (!conta) return { error: "Escolha a conta de cada componente." };
    if (!valor) return { error: "Informe um valor positivo com no máximo dois decimais em cada componente." };
    componentes.push({ contaId: conta, historico: String(x.historico ?? "").slice(0, 500), valor });
  }
  const r = await alterarComposicao(c.tenantId, c.userId, e, { transacaoId: t, lancamentoVigenteId: vigente, componentes, motivo });
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.composicao.alterada", entityType: "CoreTransacao", entityId: t, metadata: { motivo, antes: r.valor.antes, depois: r.valor.depois } });
  revalidatePath(ROTA);
  return { ok: true };
}

export async function simularRegraAction(empresaId: unknown, form: unknown): Promise<Retorno<{ simulacao: Simulacao }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  const f = objeto(form);
  const conta = id(f.contaId);
  const historico = String(f.historico ?? "").trim();
  const dc = f.dc === "C" ? "C" : f.dc === "D" ? "D" : null;
  if (!e) return { error: "Empresa não informada." };
  if (!conta) return { error: "Escolha a conta contábil." };
  if (historico.length < 2 || historico.length > 500) return { error: "O texto da regra precisa de 2 a 500 caracteres." };
  if (!dc) return { error: "A seleção mistura débito e crédito: uma regra vale para um lado só." };
  const r = await simularRegra(c.tenantId, e, { historico, dc, agenciaId: id(f.agenciaId), contaId: conta });
  return r.ok ? { ok: true, simulacao: r.valor } : { error: r.erro };
}

export async function classificarComRegraAction(empresaId: unknown, form: unknown): Promise<Retorno<{ resultado: ResultadoComRegra }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const f = objeto(form);
  const v = classificacaoManualSchema.safeParse(f);
  if (!v.success) return { error: primeiroErro(v.error) };
  const r0 = objeto(f.regra);
  const historico = String(r0.historico ?? "").trim();
  if (historico.length < 2 || historico.length > 500) return { error: "O texto da regra precisa de 2 a 500 caracteres." };
  const r = await classificarComRegra(c.tenantId, e, v.data, {
    historico, agenciaId: id(r0.agenciaId), manterHistorico: r0.manterHistorico === true, aplicarNosSemelhantes: r0.aplicarNosSemelhantes === true,
  });
  if (!r.ok) return { error: r.erro };
  if (r.valor.classificadas.length) {
    await logAudit({
      tenantId: c.tenantId, userId: c.userId, action: "contabil.core.neo.classificacao_manual", entityType: "CoreEmpresa", entityId: e,
      metadata: { contaId: v.data.contaId, historico: v.data.manterHistorico ? "(o do banco)" : v.data.descricao, transacoes: r.valor.classificadas },
    });
  }
  if (r.valor.regraCriada) {
    await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.regra.criada", entityType: "CoreRegra", entityId: r.valor.regraCriada, metadata: { nome: historico, semelhantes: r.valor.semelhantes } });
  }
  revalidatePath(ROTA);
  return { ok: true, resultado: r.valor };
}

export async function criarRegraEAplicarAction(empresaId: unknown, form: unknown): Promise<Retorno<{ associadas: number }>> {
  const c = await contexto("agir");
  if (!c) return { error: SEM_ACESSO };
  const e = id(empresaId);
  if (!e) return { error: "Empresa não informada." };
  const f = objeto(form);
  const v = regraSchema.safeParse(f);
  if (!v.success) return { error: primeiroErro(v.error) };
  const mes = typeof f.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(f.mes) ? f.mes : null;
  const r = await criarRegraEAplicar(c.tenantId, e, v.data, mes);
  if (!r.ok) return { error: r.erro };
  await logAudit({ tenantId: c.tenantId, userId: c.userId, action: "contabil.core.regra.criada", entityType: "CoreRegra", entityId: r.valor.regraId, metadata: { nome: v.data.historico, aplicadaEm: r.valor.associadas } });
  revalidatePath(ROTA);
  return { ok: true, associadas: r.valor.associadas };
}
