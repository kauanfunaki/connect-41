"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { testarConexao } from "@/lib/serpro/cliente";

/**
 * Testa a ligação, de graça: na produção só autentica (chave, segredo e
 * certificado); na demonstração, faz a consulta de exemplo do trial.
 */
export async function testarConexaoSerpro(): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado" };
  if (!isFullWrite(ctx.role)) return { ok: false, erro: "Sem permissão para configurar integrações." };
  const r = await testarConexao(ctx.tenantId);
  revalidatePath("/admin/integracoes");
  return r;
}
