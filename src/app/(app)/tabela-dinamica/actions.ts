"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { excluirModeloDaTabela, renomearModeloDaTabela, salvarModeloDaTabela } from "@/lib/relatorios/modelosDaTabelaServidor";
import type { PeriodoDoModelo, QuemVe } from "@/lib/relatorios/modelosDaTabela";

// Os modelos da Tabela dinâmica (25/11/2026, funcionalidade-816). As regras e
// a Auditoria ficam em `modelosDaTabelaServidor.ts`; aqui só a sessão e a
// revalidação da tela, que relê os modelos.

const ROTA = "/tabela-dinamica";

export async function salvarModeloDaTabelaAction(dados: {
  nome: string;
  quemVe: QuemVe;
  periodo: PeriodoDoModelo;
  comFiltros: boolean;
  query: string;
}): Promise<{ ok: true; nome: string } | { error: string }> {
  const r = await salvarModeloDaTabela(await getAuthContext(), dados);
  if ("error" in r) return r;
  revalidatePath(ROTA);
  return { ok: true, nome: r.nome };
}

export async function renomearModeloDaTabelaAction(id: string, nome: string): Promise<{ ok: true; nome: string } | { error: string }> {
  const r = await renomearModeloDaTabela(await getAuthContext(), id, nome);
  if ("ok" in r) revalidatePath(ROTA);
  return r;
}

export async function excluirModeloDaTabelaAction(id: string): Promise<{ ok: true } | { error: string }> {
  const r = await excluirModeloDaTabela(await getAuthContext(), id);
  if ("ok" in r) revalidatePath(ROTA);
  return r;
}
