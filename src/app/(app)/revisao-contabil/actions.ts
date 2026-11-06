"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import {
  CAMPOS_DA_CORRECAO,
  centavosDigitados,
  toleranciaEmCentavos,
  validarFechamento,
  type Correcoes,
} from "@/lib/revisao-contabil/fechamento";
import {
  corrigirLeitura,
  criarFechamento,
  editarFechamento,
  excluirDocumento,
  excluirFechamento,
  executarAnalise,
  gravarAcompanhamento,
  gravarTolerancia,
  marcarDocumento,
  rotuloPeloId,
} from "@/lib/revisao-contabil/servidor";

// As ações da Revisão do fechamento (05/11/2026). Trabalhar no fechamento
// (enviar, conferir, executar, acompanhar) é "agir" no setor; apagar o
// fechamento inteiro é de quem coordena ("gerir").

type Retorno<T = object> = ({ ok: true } & T) | { error: string };

const SEM_ACESSO = "Sem acesso à Revisão do fechamento.";
const ID = /^[0-9a-f-]{36}$/i;

function caminho(id: string) {
  revalidatePath("/revisao-contabil");
  revalidatePath(`/revisao-contabil/${id}`);
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function criarFechamentoAction(form: unknown): Promise<Retorno<{ id: string }>> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  const v = validarFechamento(objeto(form));
  if (!v.ok) return { error: v.erro };
  const r = await criarFechamento(ctx.tenantId, ctx.userId, v.dados);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.fechamento.criado",
    entityType: "RevisaoFechamento",
    entityId: r.valor.id,
    metadata: { nome: (await rotuloPeloId(ctx.tenantId, r.valor.id)) ?? "", regime: v.dados.regime },
  });
  revalidatePath("/revisao-contabil");
  return { ok: true, id: r.valor.id };
}

export async function editarFechamentoAction(id: unknown, form: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof id !== "string" || !ID.test(id)) return { error: "Fechamento não encontrado." };
  const v = validarFechamento(objeto(form));
  if (!v.ok) return { error: v.erro };
  const r = await editarFechamento(ctx.tenantId, id, v.dados);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.fechamento.editado",
    entityType: "RevisaoFechamento",
    entityId: id,
    metadata: { nome: (await rotuloPeloId(ctx.tenantId, id)) ?? "", regime: v.dados.regime, enquadramento: v.dados.enquadramento },
  });
  caminho(id);
  return { ok: true };
}

export async function excluirFechamentoAction(id: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "gerir"))) return { error: "Só quem coordena o setor exclui um fechamento." };
  if (typeof id !== "string" || !ID.test(id)) return { error: "Fechamento não encontrado." };
  const r = await excluirFechamento(ctx.tenantId, id);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.fechamento.excluido",
    entityType: "RevisaoFechamento",
    entityId: id,
    metadata: { nome: r.valor.nome },
  });
  revalidatePath("/revisao-contabil");
  return { ok: true };
}

export async function salvarToleranciaAction(id: unknown, valor: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof id !== "string" || !ID.test(id)) return { error: "Fechamento não encontrado." };
  const centavos = toleranciaEmCentavos(valor);
  if (centavos === null) return { error: "Informe a tolerância em reais, de 0,00 a 100,00." };
  const r = await gravarTolerancia(ctx.tenantId, id, centavos);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.tolerancia",
    entityType: "RevisaoFechamento",
    entityId: id,
    metadata: { nome: (await rotuloPeloId(ctx.tenantId, id)) ?? "", centavos },
  });
  caminho(id);
  return { ok: true };
}

export async function marcarDocumentoAction(fechamentoId: unknown, documentoId: unknown, ativo: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof fechamentoId !== "string" || !ID.test(fechamentoId) || typeof documentoId !== "string" || !ID.test(documentoId)) return { error: "Documento não encontrado." };
  const r = await marcarDocumento(ctx.tenantId, fechamentoId, documentoId, ativo === true);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.documento.marcado",
    entityType: "RevisaoDocumento",
    entityId: documentoId,
    metadata: { ativo: ativo === true },
  });
  caminho(fechamentoId);
  return { ok: true };
}

export async function excluirDocumentoAction(fechamentoId: unknown, documentoId: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof fechamentoId !== "string" || !ID.test(fechamentoId) || typeof documentoId !== "string" || !ID.test(documentoId)) return { error: "Documento não encontrado." };
  const r = await excluirDocumento(ctx.tenantId, fechamentoId, documentoId);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.documento.excluido",
    entityType: "RevisaoDocumento",
    entityId: documentoId,
    metadata: { nome: r.valor.nome },
  });
  caminho(fechamentoId);
  return { ok: true };
}

/** A correção de leitura de uma linha do balancete: valores em reais; campo vazio volta ao lido. */
export async function corrigirLeituraAction(fechamentoId: unknown, documentoId: unknown, linha: unknown, form: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof fechamentoId !== "string" || !ID.test(fechamentoId) || typeof documentoId !== "string" || !ID.test(documentoId)) return { error: "Documento não encontrado." };
  if (typeof linha !== "number") return { error: "Linha do balancete não encontrada." };
  const valores = objeto(form);
  const campos: Correcoes[string] = {};
  for (const k of CAMPOS_DA_CORRECAO) {
    const c = centavosDigitados(valores[k]);
    if (c === null) return { error: "Valor inválido: use o formato 1.234,56." };
    if (c !== undefined) campos[k] = c;
  }
  const r = await corrigirLeitura(ctx.tenantId, fechamentoId, documentoId, linha, campos);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.leitura.corrigida",
    entityType: "RevisaoDocumento",
    entityId: documentoId,
    metadata: { linha, campos },
  });
  caminho(fechamentoId);
  return { ok: true };
}

export async function executarAnaliseAction(fechamentoId: unknown): Promise<Retorno<{ achados: number }>> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof fechamentoId !== "string" || !ID.test(fechamentoId)) return { error: "Fechamento não encontrado." };
  const r = await executarAnalise(ctx.tenantId, ctx.userId, fechamentoId);
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.analise.executada",
    entityType: "RevisaoExecucao",
    entityId: r.valor.id,
    metadata: { nome: (await rotuloPeloId(ctx.tenantId, fechamentoId)) ?? "", achados: r.valor.achados },
  });
  caminho(fechamentoId);
  return { ok: true, achados: r.valor.achados };
}

export async function salvarAcompanhamentoAction(fechamentoId: unknown, execucaoId: unknown, achadoId: unknown, form: unknown): Promise<Retorno> {
  const ctx = await getAuthContext();
  if (!(await podeNoModulo(ctx, "contabil_revisao", "agir"))) return { error: SEM_ACESSO };
  if (typeof fechamentoId !== "string" || !ID.test(fechamentoId) || typeof execucaoId !== "string" || !ID.test(execucaoId)) return { error: "Execução não encontrada." };
  if (typeof achadoId !== "string" || !/^[A-Z]\d{1,4}$/.test(achadoId)) return { error: "Achado não encontrado." };
  const v = objeto(form);
  const texto = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const r = await gravarAcompanhamento(ctx.tenantId, ctx.userId, execucaoId, achadoId, { responsavel: texto("responsavel"), estado: texto("estado"), nota: texto("nota") });
  if (!r.ok) return { error: r.erro };
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "contabil.revisao.achado.acompanhado",
    entityType: "RevisaoAcompanhamento",
    entityId: `${execucaoId}:${achadoId}`,
    metadata: { nome: achadoId, estado: texto("estado") },
  });
  caminho(fechamentoId);
  return { ok: true };
}
