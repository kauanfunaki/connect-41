import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid, primeiroErro } from "@/lib/contabil-core/entradas";
import { somasDaTela } from "./telaDaConciliacao";
import type { CodigoErroRevisao, Revisao } from "./revisaoTipos";

// O que as rotas da revisão manual da conciliação têm em comum (Bloco B, Fase B3, 12/11/2026): porte das
// rotas `/revisoes*` de `src/api/v1/conciliacao_bancaria.py`. Leitura (`concilpro.read`) pede "ver" no
// módulo, como as abas; escrita (`concilpro.execute`), "agir", como a conciliação. A empresa chega no
// corpo ou na consulta e é conferida aqui; o serviço confere tenant, empresa e revisão.

export const MB = 25;
const LIMITE = MB * 1024 * 1024;

export class ArquivoGrande extends Error {}

/** Os bytes do arquivo, conferindo o tamanho também depois de ler (o `size` vem do cliente). */
export async function bytesDe(arquivo: File): Promise<Uint8Array> {
  if (arquivo.size > LIMITE) throw new ArquivoGrande();
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.length > LIMITE) throw new ArquivoGrande();
  return bytes;
}

/** `hashlib.sha256(conteudo).hexdigest()` do original: a identidade do arquivo enviado. */
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** "true", "1" ou "on" do formulário (o `confirmar_empresa` do original vinha na consulta). */
export const marcado = (v: FormDataEntryValue | null) => v === "true" || v === "1" || v === "on";

type Pessoa = { tenantId: string; userId: string };

/** Quem chama e se pode: `ver` para ler, `agir` para alterar. A resposta pronta quando não pode. */
export async function autorizar(nivel: "ver" | "agir"): Promise<{ ctx: Pessoa; recusa?: never } | { ctx?: never; recusa: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { recusa: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await podeNoModulo(ctx, "contabil_core", nivel))) {
    const error = nivel === "ver" ? "Sem acesso ao Contábil Core." : "A revisão da conciliação é de quem opera o Contábil Core.";
    return { recusa: NextResponse.json({ error }, { status: 403 }) };
  }
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId } };
}

/** O id da empresa, da revisão ou do vínculo, em minúsculas; `null` quando não é UUID. */
export function idValido(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim().toLowerCase() : "";
  return ehUuid(t) ? t : null;
}

export const semEmpresa = () => NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
export const revisaoInexistente = () => NextResponse.json({ error: "Revisão não encontrada.", codigo: "NAO_ENCONTRADA" }, { status: 404 });

/**
 * O status de cada recusa do serviço. Conflito de versão, de estado ou de fonte (os `ConflictError` do
 * original) é 409: a tela recarrega a revisão. Revisão ou vínculo inexistente, 404. O resto (inclusive
 * a confirmação da empresa, que a tela trata pelo `codigo`), 400.
 */
export function statusDoCodigo(codigo: CodigoErroRevisao | undefined): number {
  if (codigo === "NAO_ENCONTRADA") return 404;
  if (codigo === "VERSAO_DESATUALIZADA" || codigo === "CONFLITO" || codigo === "FONTE_ALTERADA") return 409;
  return 400;
}

export function recusaDoServico(r: { erro: string; codigo?: CodigoErroRevisao }): NextResponse {
  return NextResponse.json({ error: r.erro, ...(r.codigo ? { codigo: r.codigo } : {}) }, { status: statusDoCodigo(r.codigo) });
}

/** A revisão com as somas da tela do relatório guardado (como a rota da conciliação devolve). */
export function respostaDaRevisao(revisao: Revisao): NextResponse {
  return NextResponse.json({ ok: true, revisao, somas: somasDaTela(revisao.relatorio) }, { headers: { "Cache-Control": "no-store" } });
}

/** O corpo JSON como objeto; `null` quando não é um objeto. */
export async function corpoJson(req: Request): Promise<Record<string, unknown> | null> {
  const corpo: unknown = await req.json().catch(() => null);
  return corpo && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : null;
}

/** Erro inesperado: sem a mensagem nem a pilha, que podem citar o conteúdo do arquivo. */
export function erroInesperado(onde: string, err: unknown, error = "Não deu para concluir. Tente de novo."): NextResponse {
  console.error(`[contabil-core] revisão da conciliação: ${onde}`, err instanceof Error ? err.name : "erro");
  return NextResponse.json({ error }, { status: 500 });
}

// ─── Auditoria ──────────────────────────────────────────────────────────────

/** As ações que o serviço devolve (a varredura da auditoria lê este mapa para conferir as frases). */
const ACOES_DA_REVISAO: Record<string, string> = {
  "contabil.core.conciliacao.revisao.criada": "contabil.core.conciliacao.revisao.criada",
  "contabil.core.conciliacao.revisao.renomeada": "contabil.core.conciliacao.revisao.renomeada",
  "contabil.core.conciliacao.revisao.excluida": "contabil.core.conciliacao.revisao.excluida",
  "contabil.core.conciliacao.apoio.adicionado": "contabil.core.conciliacao.apoio.adicionado",
  "contabil.core.conciliacao.vinculo.confirmado": "contabil.core.conciliacao.vinculo.confirmado",
  "contabil.core.conciliacao.vinculo.desfeito": "contabil.core.conciliacao.vinculo.desfeito",
};

export type AuditoriaDaRevisao = { acao: string; dados: Record<string, unknown> } | null;

/** Grava a auditoria que o serviço montou; `null` (a criação devolveu revisão idêntica já salva) não grava. */
export async function auditar(ctx: Pessoa, revisaoId: string, auditoria: AuditoriaDaRevisao): Promise<void> {
  if (!auditoria) return;
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACOES_DA_REVISAO[auditoria.acao] ?? auditoria.acao,
    entityType: "CoreConciliacaoRevisao",
    entityId: revisaoId,
    metadata: auditoria.dados as Prisma.InputJsonValue,
  });
}

// ─── Validação dos corpos ───────────────────────────────────────────────────

// Os schemas (`VinculoCreate`, `VinculoDesfazer`, `NomeConciliacao`, `ExclusaoConciliacao`) ficam em
// `entradasRevisao.ts`, com os limites do pydantic.

/** Valida o corpo sem a `empresa` (que a rota já conferiu). */
export function validar<T>(schema: z.ZodType<T, unknown>, corpo: Record<string, unknown>): { ok: true; valor: T } | { ok: false; resposta: NextResponse } {
  const { empresa: _empresa, ...resto } = corpo;
  void _empresa;
  const r = schema.safeParse(resto);
  if (!r.success) return { ok: false, resposta: NextResponse.json({ error: primeiroErro(r.error) }, { status: 400 }) };
  return { ok: true, valor: r.data };
}
