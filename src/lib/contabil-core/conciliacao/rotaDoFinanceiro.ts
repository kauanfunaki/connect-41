import "server-only";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import type { AnaliseFinanceiro, CodigoErroFinanceiro, TipoComparacao, TipoDocumentoFinanceiro } from "./financeiroTipos";

// O que as rotas da conferência do financeiro têm em comum (Bloco B, Fase B4, 12/11/2026): porte de
// `src/api/v1/conciliacao_financeiro.py`. Leitura (`concilpro.read`) pede "ver" no módulo; escrita
// (`concilpro.execute`), "agir", como a revisão da conciliação (B3). A empresa chega no corpo ou na
// consulta e é conferida aqui (UUID); o serviço confere tenant, empresa e análise. O que é igual ao da
// revisão (bytes com limite, id, corpo JSON, validação) vem de `rotaDaRevisao.ts`.

type Pessoa = { tenantId: string; userId: string };

/** Quem chama e se pode: `ver` para ler, `agir` para alterar. A resposta pronta quando não pode. */
export async function autorizarFinanceiro(nivel: "ver" | "agir"): Promise<{ ctx: Pessoa; recusa?: never } | { ctx?: never; recusa: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { recusa: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await podeNoModulo(ctx, "contabil_core", nivel))) {
    const error = nivel === "ver" ? "Sem acesso ao Contábil Core." : "A conferência do financeiro é de quem opera o Contábil Core.";
    return { recusa: NextResponse.json({ error }, { status: 403 }) };
  }
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId } };
}

export const analiseInexistente = () => NextResponse.json({ error: "Análise do financeiro não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" }, { status: 404 });

/**
 * O status de cada recusa do serviço. Conflito de versão, de estado, arquivo repetido ou extrato que
 * mudou (os `ConflictError` do original) é 409: a tela recarrega a análise e não repete a gravação.
 * Análise, documento ou conferência inexistente, 404. O resto (inclusive a confirmação da empresa,
 * que a tela trata pelo `codigo`), 400.
 */
export function statusDoFinanceiro(codigo: CodigoErroFinanceiro | undefined): number {
  if (codigo === "NAO_ENCONTRADA") return 404;
  if (codigo === "VERSAO_DESATUALIZADA" || codigo === "CONFLITO" || codigo === "EXTRATO_ALTERADO") return 409;
  return 400;
}

export function recusaDoFinanceiro(r: { erro: string; codigo?: CodigoErroFinanceiro }): NextResponse {
  return NextResponse.json({ error: r.erro, ...(r.codigo ? { codigo: r.codigo } : {}) }, { status: statusDoFinanceiro(r.codigo) });
}

const SEM_CACHE = { "Cache-Control": "no-store" };

export const respostaDaAnalise = (analise: AnaliseFinanceiro) => NextResponse.json({ ok: true, analise }, { headers: SEM_CACHE });
export const respostaSemCache = (corpo: Record<string, unknown>) => NextResponse.json(corpo, { headers: SEM_CACHE });

/** Erro inesperado: sem a mensagem nem a pilha, que podem citar o conteúdo do arquivo. */
export function erroDoFinanceiro(onde: string, err: unknown, error = "Não deu para concluir. Tente de novo."): NextResponse {
  console.error(`[contabil-core] conferência do financeiro: ${onde}`, err instanceof Error ? err.name : "erro");
  return NextResponse.json({ error }, { status: 500 });
}

// ─── Tipos que chegam na consulta ou no formulário ──────────────────────────

const DOCUMENTOS: readonly TipoDocumentoFinanceiro[] = ["FINANCEIRO", "SISPAG", "RAZAO", "EXTRATO_DETALHADO"];
const COMPARACOES: readonly TipoComparacao[] = ["EXTRATO", "SISPAG", "RAZAO", "RAZAO_SISPAG", "RAZAO_DETALHADO"];

/** `TipoDocumento` do original: exato (maiúsculas), sem aparar. */
export const tipoDeDocumento = (v: unknown): TipoDocumentoFinanceiro | null =>
  typeof v === "string" && (DOCUMENTOS as readonly string[]).includes(v) ? (v as TipoDocumentoFinanceiro) : null;

/** `TipoComparacao` do original. */
export const tipoDeComparacao = (v: unknown): TipoComparacao | null =>
  typeof v === "string" && (COMPARACOES as readonly string[]).includes(v) ? (v as TipoComparacao) : null;

/**
 * O leitor recusou o arquivo (`ExtratoDetalhadoInvalido`, `FinanceiroInvalido`, `RazaoInvalido`,
 * `SispagInvalido` do original): a mensagem é escrita para a pessoa e vai na resposta, como o
 * `ValidationError(str(exc))` da rota original. O serviço já devolve essas recusas como `{ ok: false }`;
 * isto é a rede de segurança para um leitor que escape dele. Pelo nome, que todos os leitores definem.
 */
const LEITURA_RECUSADA = new Set(["ExtratoDetalhadoInvalido", "FinanceiroInvalido", "RazaoInvalido", "RazaoApoioInvalido", "SispagInvalido"]);

export const leituraRecusada = (err: unknown): err is Error => err instanceof Error && LEITURA_RECUSADA.has(err.name);

// ─── Download do original ───────────────────────────────────────────────────

/** Só os formatos que a análise aceita; qualquer outro vai como bytes genéricos (o `nosniff` segura). */
const FORMATOS: Record<string, string> = {
  "application/pdf": "application/pdf",
  "application/vnd.ms-excel": "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export const formatoDoOriginal = (mediaType: string | null | undefined) => FORMATOS[(mediaType ?? "").split(";")[0].trim().toLowerCase()] ?? "application/octet-stream";

// ─── Auditoria ──────────────────────────────────────────────────────────────

/**
 * As ações que o serviço devolve (`ACOES_DO_FINANCEIRO`, em `servidor/financeiro.ts`), escritas aqui por
 * extenso porque a varredura da auditoria só lê o mapa do arquivo que chama `logAudit`. O teste das
 * rotas confere que as duas listas são iguais.
 */
const ACOES_DA_CONFERENCIA: Record<string, string> = {
  "contabil.core.financeiro.analise.criada": "contabil.core.financeiro.analise.criada",
  "contabil.core.financeiro.analise.renomeada": "contabil.core.financeiro.analise.renomeada",
  "contabil.core.financeiro.analise.excluida": "contabil.core.financeiro.analise.excluida",
  "contabil.core.financeiro.documento.adicionado": "contabil.core.financeiro.documento.adicionado",
  "contabil.core.financeiro.vinculo.confirmado": "contabil.core.financeiro.vinculo.confirmado",
  "contabil.core.financeiro.vinculos.confirmados": "contabil.core.financeiro.vinculos.confirmados",
  "contabil.core.financeiro.vinculo.desfeito": "contabil.core.financeiro.vinculo.desfeito",
};

export const ACOES_AUDITADAS_NA_ROTA = Object.keys(ACOES_DA_CONFERENCIA);

export type AuditoriaDoFinanceiro = { acao: string; dados: Record<string, unknown> } | null;

/** Grava a auditoria que o serviço montou; `null` não grava. */
export async function auditarFinanceiro(ctx: Pessoa, analiseId: string, auditoria: AuditoriaDoFinanceiro): Promise<void> {
  if (!auditoria) return;
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACOES_DA_CONFERENCIA[auditoria.acao] ?? auditoria.acao,
    entityType: "CoreFinanceiroAnalise",
    entityId: analiseId,
    metadata: auditoria.dados as Prisma.InputJsonValue,
  });
}
