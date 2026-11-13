"use server";

// A busca do seletor de empresa ou pessoa, pedida pelo navegador enquanto se
// digita (13/11/2026, melhoria-662). Empresas e pessoas são conhecimento geral
// do escritório (ver `scopedCompanyWhere`): basta estar no tenant.

import { getAuthContext } from "@/lib/auth/context";
import { buscarEntidadesDoSeletor, type ResultadoDaBusca, type TipoDaEntidade } from "@/lib/empresas/buscaDoSeletor";

export async function buscarEntidades(tipo: TipoDaEntidade, termo: string, incluir: string[] = []): Promise<ResultadoDaBusca> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || (tipo !== "COMPANY" && tipo !== "PERSON")) return { opcoes: [], incluidas: [] };
  return buscarEntidadesDoSeletor(ctx, tipo, typeof termo === "string" ? termo : "", Array.isArray(incluir) ? incluir : []);
}
