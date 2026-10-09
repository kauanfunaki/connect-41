"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { acessoAsAutorizacoes, definirQuemRecebe, salvarAutorizacao, salvarEmLote, MAXIMO_NO_LOTE, type ResumoDoLote } from "@/lib/autorizacoes/servidor";
import type { EntradaDaAutorizacao } from "@/lib/autorizacoes/regras";

/** O que veio do navegador, só com os campos conhecidos e do tipo certo. */
function entradaLimpa(e: unknown): EntradaDaAutorizacao {
  const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    status: texto(o.status) ?? "",
    requestedAt: texto(o.requestedAt),
    receivedAt: texto(o.receivedAt),
    validatedAt: texto(o.validatedAt),
    expiresAt: texto(o.expiresAt),
    allServices: o.allServices !== false,
    services: texto(o.services),
    notes: texto(o.notes),
  };
}

function revalidar() {
  revalidatePath("/autorizacoes");
  revalidatePath("/empresas/[id]", "page");
}

export async function atualizarAutorizacao(chave: string, entrada: unknown): Promise<{ ok: true } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) return { ok: false, erro: "Módulo não habilitado ou sem acesso." };
  if (typeof chave !== "string" || !/^\d{8}$|^\d{11}$/.test(chave)) return { ok: false, erro: "Empresa não encontrada." };
  const r = await salvarAutorizacao(acesso, chave, entradaLimpa(entrada));
  if (r.ok) revalidar();
  return r;
}

export async function atualizarEmLote(texto: unknown, entrada: unknown): Promise<ResumoDoLote> {
  const vazio: ResumoDoLote = { atualizadas: 0, semEmpresa: [], invalidos: [], erro: null };
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) return { ...vazio, erro: "Módulo não habilitado ou sem acesso." };
  // ~20 caracteres por CNPJ com nome ao lado: o teto do lote cabe com folga.
  if (typeof texto !== "string" || texto.length > MAXIMO_NO_LOTE * 200) return { ...vazio, erro: "Lista grande demais." };
  const r = await salvarEmLote(acesso, texto, entradaLimpa(entrada));
  if (r.atualizadas > 0) revalidar();
  return r;
}

export async function definirQuemRecebeAction(nome: unknown, cnpj: unknown): Promise<{ ok: true } | { ok: false; erro: string }> {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) return { ok: false, erro: "Módulo não habilitado ou sem acesso." };
  if (typeof nome !== "string" || typeof cnpj !== "string") return { ok: false, erro: "Informe o nome e o CNPJ." };
  const r = await definirQuemRecebe(acesso, nome, cnpj);
  if (r.ok) revalidatePath("/autorizacoes");
  return r;
}
