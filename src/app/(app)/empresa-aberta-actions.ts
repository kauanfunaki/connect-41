"use server";

import { getAuthContext } from "@/lib/auth/context";
import { gravarUltimaEmpresa } from "@/lib/empresas/ultimaEmpresa";

/**
 * Guarda a empresa escolhida no seletor de uma tela como a última aberta por
 * quem está logado (13/10/2026) — a próxima tela de uma empresa por vez abre
 * nela. Preferência pessoal: não concede acesso a nada, e a empresa só é
 * gravada se for do escritório e visível para a pessoa.
 *
 * Quem chama navega em seguida; o resultado só diz se gravou.
 */
export async function registrarEmpresaAberta(companyId: string): Promise<{ ok: boolean }> {
  if (typeof companyId !== "string" || companyId.length === 0 || companyId.length > 191) return { ok: false };
  const ctx = await getAuthContext();
  if (!ctx.userId || !ctx.tenantId) return { ok: false };
  return { ok: await gravarUltimaEmpresa(ctx, companyId) };
}
