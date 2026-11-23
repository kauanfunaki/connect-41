import "server-only";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { ehUuid } from "../entradas";
import { POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO, type CamposDoComprovante, type CodigoErroComprovante, type ResumoDoComprovante } from "./servico";

// O que as rotas dos comprovantes de pagamento têm em comum (Bloco C, Fase C2, 19/11/2026): porte de
// `src/api/v1/comprovantes.py`. Ler (`comprovantes.read`) pede "ver" no módulo; escrever
// (`comprovantes.write`), "agir". Ler o arquivo para pré-preencher também pede "agir": ele serve a quem
// cadastra e gasta a IA do escritório (no original, `comprovantes.read`). A empresa chega no corpo, no
// formulário ou na consulta e é conferida aqui (UUID); o serviço confere tenant, empresa e comprovante.

type Pessoa = { tenantId: string; userId: string };

/** Quem chama e se pode: `ver` para ler, `agir` para alterar. A resposta pronta quando não pode. */
export async function autorizarComprovantes(nivel: "ver" | "agir"): Promise<{ ctx: Pessoa; recusa?: never } | { ctx?: never; recusa: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { recusa: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await podeNoModulo(ctx, "contabil_core", nivel))) {
    const error = nivel === "ver" ? "Sem acesso ao Contábil Core." : "Cadastrar e associar comprovantes de pagamento é de quem opera o Contábil Core.";
    return { recusa: NextResponse.json({ error }, { status: 403 }) };
  }
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId } };
}

export const comprovanteInexistente = () => NextResponse.json({ error: "Comprovante não encontrado.", codigo: "NAO_ENCONTRADA" }, { status: 404 });

/** Comprovante ou transação inexistente, 404; já associado, arquivo repetido e possível duplicado, 409; o resto, 400. */
export function statusDoComprovante(codigo: CodigoErroComprovante): number {
  if (codigo === "NAO_ENCONTRADA") return 404;
  if (codigo === "CONFLITO" || codigo === "COMPROVANTE_JA_IMPORTADO" || codigo === "COMPROVANTE_POSSIVEL_DUPLICADO") return 409;
  return 400;
}

export const recusaDoComprovante = (r: { erro: string; codigo: CodigoErroComprovante; detalhes?: ResumoDoComprovante }) =>
  NextResponse.json({ error: r.erro, codigo: r.codigo, ...(r.detalhes ? { detalhes: r.detalhes } : {}) }, { status: statusDoComprovante(r.codigo) });

const SEM_CACHE = { "Cache-Control": "no-store" };
export const respostaSemCache = (corpo: Record<string, unknown>) => NextResponse.json(corpo, { headers: SEM_CACHE });

/** Erro inesperado: sem a mensagem nem a pilha, que podem citar o conteúdo do arquivo. */
export function erroDosComprovantes(onde: string, err: unknown, error = "Não deu para concluir. Tente de novo."): NextResponse {
  console.error(`[contabil-core] comprovantes: ${onde}`, err instanceof Error ? err.name : "erro");
  return NextResponse.json({ error }, { status: 500 });
}

// ─── Consulta da lista ──────────────────────────────────────────────────────

/** Os filtros, a página e o tamanho da consulta (`page` ≥ 1, `page_size` de 1 a 200, como o original). */
export function consultaDaLista(
  q: URLSearchParams,
): { ok: true; filtros: { agenciaId: string | null; transacaoId: string | null; status: string | null }; pagina: number; porPagina: number } | { ok: false; erro: string } {
  const pagina = Number(q.get("pagina") ?? "1");
  const porPagina = Number(q.get("porPagina") ?? String(POR_PAGINA_PADRAO));
  if (!Number.isInteger(pagina) || pagina < 1) return { ok: false, erro: "Página inválida." };
  if (!Number.isInteger(porPagina) || porPagina < 1 || porPagina > POR_PAGINA_MAXIMO) return { ok: false, erro: "Tamanho de página inválido." };
  const id = (nome: string): string | null | false => {
    const v = q.get(nome)?.trim().toLowerCase();
    if (!v) return null;
    return ehUuid(v) ? v : false;
  };
  const agenciaId = id("agencia");
  const transacaoId = id("transacao");
  if (agenciaId === false) return { ok: false, erro: "Conta bancária inválida." };
  if (transacaoId === false) return { ok: false, erro: "Transação inválida." };
  return { ok: true, pagina, porPagina, filtros: { agenciaId, transacaoId, status: q.get("status")?.slice(0, 40) || null } };
}

// ─── Corpo do cadastro ──────────────────────────────────────────────────────

/** Os campos do `ComprovanteCreate`: o nome no corpo (camelCase) e o do original. */
const CAMPOS: readonly (readonly [keyof CamposDoComprovante, string])[] = [
  ["favorecido", "favorecido"],
  ["cpfCnpj", "cpf_cnpj"],
  ["dataPagamento", "data_pagamento"],
  ["dataVencimento", "data_vencimento"],
  ["valorDocumento", "valor_documento"],
  ["valorPago", "valor_pago"],
  ["juros", "juros"],
  ["multa", "multa"],
  ["desconto", "desconto"],
  ["observacao", "observacao"],
  ["agenciaId", "agencia_id"],
  ["transacaoId", "transacao_id"],
  ["arquivoNome", "arquivo_nome"],
  ["permitirDuplicado", "permitir_duplicado"],
];

/** Os campos do cadastro a partir do objeto do corpo (JSON ou o campo `dados` do formulário). */
export function camposDoCorpo(corpo: Record<string, unknown>): CamposDoComprovante {
  const campos: CamposDoComprovante = {};
  for (const [nome, doOriginal] of CAMPOS) {
    const v = corpo[nome] !== undefined ? corpo[nome] : corpo[doOriginal];
    if (v !== undefined) campos[nome] = v;
  }
  return campos;
}

// ─── Auditoria ──────────────────────────────────────────────────────────────

/**
 * As ações que o serviço devolve (`ACOES_DOS_COMPROVANTES`, em `servidor/comprovantes.ts`), escritas aqui
 * por extenso porque a varredura da auditoria só lê o mapa do arquivo que chama `logAudit`. O teste das
 * rotas confere que as duas listas são iguais.
 */
const ACOES_DOS_COMPROVANTES_NA_ROTA: Record<string, string> = {
  "contabil.core.comprovante.criado": "contabil.core.comprovante.criado",
  "contabil.core.comprovante.associado": "contabil.core.comprovante.associado",
  "contabil.core.comprovante.desassociado": "contabil.core.comprovante.desassociado",
  "contabil.core.comprovante.excluido": "contabil.core.comprovante.excluido",
};

export const ACOES_AUDITADAS_NA_ROTA = Object.keys(ACOES_DOS_COMPROVANTES_NA_ROTA);

/** Grava a auditoria de um comprovante (entidade: o comprovante). */
export async function auditarComprovante(ctx: Pessoa, comprovanteId: string, auditoria: { acao: string; dados: Record<string, unknown> }): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACOES_DOS_COMPROVANTES_NA_ROTA[auditoria.acao] ?? auditoria.acao,
    entityType: "CoreComprovante",
    entityId: comprovanteId,
    metadata: auditoria.dados as Prisma.InputJsonValue,
  });
}
