import "server-only";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { idValido } from "../conciliacao/rotaDaRevisao";
import type { CodigoErroCartao } from "./servico";

// O que as rotas dos cartões têm em comum (Bloco C, Fase C3, 23/11/2026): porte de
// `src/api/v1/cartoes.py`. Ler (`cartoes.read`) pede "ver" no módulo; escrever e executar
// (`cartoes.write`, `cartoes.execute` e, na aplicação da distribuição, `neo.execute`) pedem "agir". A empresa
// chega na consulta, no corpo ou no formulário e é conferida aqui (UUID); o serviço confere tenant, empresa,
// cartão e fatura.

export type Pessoa = { tenantId: string; userId: string };

/** Quem chama e se pode: `ver` para ler, `agir` para alterar. A resposta pronta quando não pode. */
export async function autorizarCartoes(nivel: "ver" | "agir"): Promise<{ ctx: Pessoa; recusa?: never } | { ctx?: never; recusa: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { recusa: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await podeNoModulo(ctx, "contabil_core", nivel))) {
    const error = nivel === "ver" ? "Sem acesso ao Contábil Core." : "Cadastrar cartões, lançar e distribuir faturas é de quem opera o Contábil Core.";
    return { recusa: NextResponse.json({ error }, { status: 403 }) };
  }
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId } };
}

/** Os ids do caminho (cartão, fatura, lançamento, documento): UUID ou "não encontrado". */
export function idsDoCaminho<K extends string>(params: Record<K, string>): Record<K, string> | null {
  const saida = {} as Record<K, string>;
  for (const [k, v] of Object.entries(params) as [K, string][]) {
    const id = idValido(v);
    if (!id) return null;
    saida[k] = id;
  }
  return saida;
}

export const naoEncontrado = (error = "Não encontrado.") => NextResponse.json({ error, codigo: "NAO_ENCONTRADA" }, { status: 404 });

/** 404 (`NotFoundError`), 409 (`ConflictError`) e 422 (`ValidationError`), como o original. */
export function statusDoCartao(codigo: CodigoErroCartao): number {
  if (codigo === "NAO_ENCONTRADA") return 404;
  if (codigo === "CONFLITO") return 409;
  return 422;
}

export const recusaDoCartao = (r: { erro: string; codigo: CodigoErroCartao }) => NextResponse.json({ error: r.erro, codigo: r.codigo }, { status: statusDoCartao(r.codigo) });

const SEM_CACHE = { "Cache-Control": "no-store" };
export const respostaSemCache = (corpo: Record<string, unknown>, status = 200) => NextResponse.json(corpo, { status, headers: SEM_CACHE });

/** Erro inesperado: sem a mensagem nem a pilha, que podem citar o conteúdo do arquivo. */
export function erroDosCartoes(onde: string, err: unknown, error = "Não deu para concluir. Tente de novo."): NextResponse {
  console.error(`[contabil-core] cartões: ${onde}`, err instanceof Error ? err.name : "erro");
  return NextResponse.json({ error }, { status: 500 });
}

// ─── Corpo ──────────────────────────────────────────────────────────────────

/** Os nomes do original (snake_case) → os do porte (camelCase). O corpo pode vir com qualquer um. */
const NOMES: Record<string, string> = {
  ultimos_digitos: "ultimosDigitos",
  dia_fechamento: "diaFechamento",
  dia_vencimento: "diaVencimento",
  data_fechamento: "dataFechamento",
  data_vencimento: "dataVencimento",
  data_compra: "dataCompra",
  conta_id: "contaId",
  parcela_atual: "parcelaAtual",
  parcela_total: "parcelaTotal",
  transacao_id: "transacaoId",
  classificacao_hash: "classificacaoHash",
  preservar_classificacao_atual: "preservarClassificacaoAtual",
  pendencias_resolvidas: "pendenciasResolvidas",
};

/** O corpo com os nomes do porte (o camelCase vence quando os dois vêm). */
export function camposDoCorpo(corpo: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(corpo)) {
    const nosso = NOMES[k];
    if (nosso) {
      if (corpo[nosso] === undefined) saida[nosso] = v;
    } else saida[k] = v;
  }
  return saida;
}

// ─── Auditoria ──────────────────────────────────────────────────────────────

/**
 * As ações que o serviço devolve (`ACOES_DOS_CARTOES` e `ACOES_DAS_FATURAS`), escritas aqui por extenso
 * porque a varredura da auditoria só lê o mapa do arquivo que chama `logAudit`. O teste das rotas confere
 * que as listas são iguais.
 */
const ACOES_NA_ROTA: Record<string, string> = {
  "contabil.core.cartao.criado": "contabil.core.cartao.criado",
  "contabil.core.cartao.alterado": "contabil.core.cartao.alterado",
  "contabil.core.cartao.removido": "contabil.core.cartao.removido",
  "contabil.core.fatura.criada": "contabil.core.fatura.criada",
  "contabil.core.fatura.alterada": "contabil.core.fatura.alterada",
  "contabil.core.fatura.paga": "contabil.core.fatura.paga",
  "contabil.core.fatura.pagamento_desassociado": "contabil.core.fatura.pagamento_desassociado",
  "contabil.core.fatura.lancamento.criado": "contabil.core.fatura.lancamento.criado",
  "contabil.core.fatura.lancamento.removido": "contabil.core.fatura.lancamento.removido",
  "contabil.core.fatura.lancamentos.importados": "contabil.core.fatura.lancamentos.importados",
  "contabil.core.fatura.distribuicao.salva": "contabil.core.fatura.distribuicao.salva",
  "contabil.core.fatura.distribuicao.aplicada": "contabil.core.fatura.distribuicao.aplicada",
  "contabil.core.fatura.distribuicao.desfeita": "contabil.core.fatura.distribuicao.desfeita",
  "contabil.core.fatura.documento.adicionado": "contabil.core.fatura.documento.adicionado",
  "contabil.core.fatura.documento.relido": "contabil.core.fatura.documento.relido",
  "contabil.core.fatura.documento.revisado": "contabil.core.fatura.documento.revisado",
  "contabil.core.composicao.alterada": "contabil.core.composicao.alterada",
  "contabil.core.lancamento.cancelado": "contabil.core.lancamento.cancelado",
};

export const ACOES_AUDITADAS_NA_ROTA = Object.keys(ACOES_NA_ROTA);

/** Grava as auditorias de uma escrita, na ordem (a composição do NEO antes da distribuição). */
export async function auditarCartoes(ctx: Pessoa, auditorias: readonly { entidade: string; entidadeId: string; acao: string; dados: Record<string, unknown> }[]): Promise<void> {
  for (const a of auditorias) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: ACOES_NA_ROTA[a.acao] ?? a.acao,
      entityType: a.entidade,
      entityId: a.entidadeId,
      metadata: a.dados as Prisma.InputJsonValue,
    });
  }
}

// ─── O passo comum das rotas ────────────────────────────────────────────────

type ResultadoDoServico<T> = { ok: true; valor: { valor: T; auditoria: readonly { entidade: string; entidadeId: string; acao: string; dados: Record<string, unknown> }[] } } | { ok: false; erro: string; codigo: CodigoErroCartao };

/**
 * Uma escrita: autoriza "agir", lê o corpo JSON (a empresa vai nele), confere os ids do caminho, chama o
 * serviço, registra a auditoria e devolve `{ ok: true, [chave]: valor }`.
 */
export async function escritaJson<K extends string, T>(
  req: Request,
  params: Promise<Record<K, string>>,
  chave: string,
  onde: string,
  servico: (ctx: Pessoa, empresaId: string, ids: Record<K, string>, corpo: Record<string, unknown>) => Promise<ResultadoDoServico<T>>,
  status = 200,
): Promise<NextResponse> {
  const a = await autorizarCartoes("agir");
  if (a.recusa) return a.recusa;
  const ids = idsDoCaminho(await params);
  if (!ids) return naoEncontrado();
  const corpo = req.method === "DELETE" ? {} : await corpoJsonOuVazio(req);
  if (!corpo) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const empresaId = idValido(corpo.empresa ?? new URL(req.url).searchParams.get("empresa"));
  if (!empresaId) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  try {
    const r = await servico(a.ctx, empresaId, ids, camposDoCorpo(corpo));
    if (!r.ok) return recusaDoCartao(r);
    await auditarCartoes(a.ctx, r.valor.auditoria);
    return respostaSemCache({ ok: true, [chave]: r.valor.valor }, status);
  } catch (err) {
    return erroDosCartoes(onde, err);
  }
}

/** Uma leitura: autoriza "ver", a empresa vem na consulta. */
export async function leitura<K extends string, T>(
  req: Request,
  params: Promise<Record<K, string>>,
  chave: string,
  onde: string,
  servico: (ctx: Pessoa, empresaId: string, ids: Record<K, string>, consulta: URLSearchParams) => Promise<{ ok: true; valor: T } | { ok: false; erro: string; codigo: CodigoErroCartao }>,
): Promise<NextResponse> {
  const a = await autorizarCartoes("ver");
  if (a.recusa) return a.recusa;
  const ids = idsDoCaminho(await params);
  if (!ids) return naoEncontrado();
  const consulta = new URL(req.url).searchParams;
  const empresaId = idValido(consulta.get("empresa"));
  if (!empresaId) return NextResponse.json({ error: "Empresa não informada." }, { status: 400 });
  try {
    const r = await servico(a.ctx, empresaId, ids, consulta);
    if (!r.ok) return recusaDoCartao(r);
    return respostaSemCache({ ok: true, [chave]: r.valor });
  } catch (err) {
    return erroDosCartoes(onde, err);
  }
}

/** O corpo JSON (objeto), `{}` sem corpo, ou `null` quando não é um objeto JSON. */
async function corpoJsonOuVazio(req: Request): Promise<Record<string, unknown> | null> {
  const texto = await req.text().catch(() => null);
  if (texto === null) return null;
  if (!texto.trim()) return {};
  try {
    const v: unknown = JSON.parse(texto);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
