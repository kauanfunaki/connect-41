import "server-only";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { getAuthContext } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { logAudit } from "@/lib/audit";
import { emissaoDaNota, POR_PAGINA_MAXIMO, POR_PAGINA_PADRAO, type CodigoErroNota, type FiltrosDaLista } from "./servico";

// O que as rotas das notas fiscais têm em comum (Bloco C, Fase C1, 18/11/2026): porte de
// `src/api/v1/notas.py`. Leitura (`notas.read`) pede "ver" no módulo; escrita (`notas.write`), "agir".
// A empresa chega no corpo, no formulário ou na consulta e é conferida aqui (UUID); o serviço confere
// tenant, empresa e nota.

type Pessoa = { tenantId: string; userId: string };

/** Quem chama e se pode: `ver` para ler, `agir` para alterar. A resposta pronta quando não pode. */
export async function autorizarNotas(nivel: "ver" | "agir"): Promise<{ ctx: Pessoa; recusa?: never } | { ctx?: never; recusa: NextResponse }> {
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { recusa: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (!(await podeNoModulo(ctx, "contabil_core", nivel))) {
    const error = nivel === "ver" ? "Sem acesso ao Contábil Core." : "Importar e associar notas fiscais é de quem opera o Contábil Core.";
    return { recusa: NextResponse.json({ error }, { status: 403 }) };
  }
  return { ctx: { tenantId: ctx.tenantId, userId: ctx.userId } };
}

export const notaInexistente = () => NextResponse.json({ error: "Nota fiscal não encontrada.", codigo: "NAO_ENCONTRADA" }, { status: 404 });

/** Nota ou transação inexistente, 404; nota já associada ou cadastrada, 409; o resto, 400. */
export function statusDaNota(codigo: CodigoErroNota): number {
  if (codigo === "NAO_ENCONTRADA") return 404;
  if (codigo === "CONFLITO") return 409;
  return 400;
}

export const recusaDaNota = (r: { erro: string; codigo: CodigoErroNota }) =>
  NextResponse.json({ error: r.erro, codigo: r.codigo }, { status: statusDaNota(r.codigo) });

const SEM_CACHE = { "Cache-Control": "no-store" };
export const respostaSemCache = (corpo: Record<string, unknown>) => NextResponse.json(corpo, { headers: SEM_CACHE });

/** Erro inesperado: sem a mensagem nem a pilha, que podem citar o conteúdo do arquivo. */
export function erroDasNotas(onde: string, err: unknown, error = "Não deu para concluir. Tente de novo."): NextResponse {
  console.error(`[contabil-core] notas fiscais: ${onde}`, err instanceof Error ? err.name : "erro");
  return NextResponse.json({ error }, { status: 500 });
}

// ─── Consulta da lista ──────────────────────────────────────────────────────

/**
 * Data do filtro: "AAAA-MM-DD" é o dia inteiro no fuso do escritório (o início para `de`, o último
 * milissegundo para `ate`); data e hora ISO valem como vierem (o original recebia `datetime`).
 */
export function dataDoFiltro(v: string, fim: boolean): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const e = emissaoDaNota(`${v}T${fim ? "23:59:59.999" : "00:00:00"}-03:00`);
    return e ? e.utc : null;
  }
  const e = emissaoDaNota(v);
  return e ? e.utc : null;
}

/** Os filtros, a página e o tamanho da consulta (`page` ≥ 1, `page_size` de 1 a 200, como o original). */
export function consultaDaLista(q: URLSearchParams): { ok: true; filtros: FiltrosDaLista; pagina: number; porPagina: number } | { ok: false; erro: string } {
  const pagina = Number(q.get("pagina") ?? "1");
  const porPagina = Number(q.get("porPagina") ?? String(POR_PAGINA_PADRAO));
  if (!Number.isInteger(pagina) || pagina < 1) return { ok: false, erro: "Página inválida." };
  if (!Number.isInteger(porPagina) || porPagina < 1 || porPagina > POR_PAGINA_MAXIMO) return { ok: false, erro: "Tamanho de página inválido." };
  const texto = (nome: string) => {
    const v = q.get(nome);
    return v ? v.slice(0, 200) : null;
  };
  let dataDe: Date | null = null;
  let dataAte: Date | null = null;
  const de = q.get("de");
  const ate = q.get("ate");
  if (de) {
    dataDe = dataDoFiltro(de, false);
    if (!dataDe) return { ok: false, erro: "Data inicial inválida." };
  }
  if (ate) {
    dataAte = dataDoFiltro(ate, true);
    if (!dataAte) return { ok: false, erro: "Data final inválida." };
  }
  return {
    ok: true,
    pagina,
    porPagina,
    filtros: {
      tipo: texto("tipo"),
      status: texto("status"),
      numero: texto("numero"),
      chaveAcesso: texto("chave"),
      cnpj: texto("cnpj"),
      emitente: texto("emitente"),
      dataDe,
      dataAte,
    },
  };
}

// ─── Auditoria ──────────────────────────────────────────────────────────────

/**
 * As ações que o serviço devolve (`ACOES_DAS_NOTAS`, em `servidor/notas.ts`), escritas aqui por extenso
 * porque a varredura da auditoria só lê o mapa do arquivo que chama `logAudit`. O teste das rotas
 * confere que as duas listas são iguais.
 */
const ACOES_DAS_NOTAS_NA_ROTA: Record<string, string> = {
  "contabil.core.nota.criada": "contabil.core.nota.criada",
  "contabil.core.notas.importadas": "contabil.core.notas.importadas",
  "contabil.core.nota.associada": "contabil.core.nota.associada",
  "contabil.core.nota.desassociada": "contabil.core.nota.desassociada",
  "contabil.core.nota.cancelada": "contabil.core.nota.cancelada",
};

export const ACOES_AUDITADAS_NA_ROTA = Object.keys(ACOES_DAS_NOTAS_NA_ROTA);

/** Grava a auditoria de uma nota (entidade: a nota). */
export async function auditarNota(ctx: Pessoa, notaId: string, auditoria: { acao: string; dados: Record<string, unknown> }): Promise<void> {
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACOES_DAS_NOTAS_NA_ROTA[auditoria.acao] ?? auditoria.acao,
    entityType: "CoreNotaFiscal",
    entityId: notaId,
    metadata: auditoria.dados as Prisma.InputJsonValue,
  });
}

/** Grava a auditoria de uma importação (entidade: a empresa do Contábil Core); `null` não grava. */
export async function auditarImportacao(ctx: Pessoa, empresaId: string, auditoria: { acao: string; dados: Record<string, unknown> } | null): Promise<void> {
  if (!auditoria) return;
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ACOES_DAS_NOTAS_NA_ROTA[auditoria.acao] ?? auditoria.acao,
    entityType: "CoreEmpresa",
    entityId: empresaId,
    metadata: auditoria.dados as Prisma.InputJsonValue,
  });
}
