// Valora no Connect: o que o escritório guardou por cima do catálogo modelo.
// O cálculo é do motor (./motor); aqui só se lê e se monta o catálogo do tenant.

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector, canManageSector, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import {
  aplicarAjustes,
  MODELO_41,
  normalizarAjustes,
  normalizarParametros,
  PARAMETROS_PADRAO,
  type AjusteSetor,
  type Catalogo,
  type ParametrosPreco,
} from "./motor";

export const MODULO_VALORA = "gestao_valora";

export type ConfigDoValora = {
  catalogo: Catalogo;
  ajustes: AjusteSetor[];
  parametros: ParametrosPreco;
  /** false = nunca salvo: custos zerados, preço só com rateio. */
  configurado: boolean;
};

export async function configDoValora(tenantId: string): Promise<ConfigDoValora> {
  const salvo = await getPrisma().valoraConfig.findUnique({ where: { tenantId } });
  const ajustes = (salvo && normalizarAjustes(salvo.ajustes, MODELO_41)) ?? [];
  const parametros = (salvo && normalizarParametros(salvo.parametros)) ?? PARAMETROS_PADRAO;
  return { catalogo: aplicarAjustes(MODELO_41, ajustes), ajustes, parametros, configurado: !!salvo };
}

/** Quem pode ver as telas do Valora, e o que pode fazer nelas. null = não vê (a página dá 404). */
export async function acessoAoValora() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return null;
  const setor = (await setorDoModulo(ctx.tenantId, MODULO_VALORA)) ?? getModuleDef(MODULO_VALORA)!.sectorCode;
  if (!canViewSector(ctx, setor)) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_VALORA))) return null;
  return {
    tenantId: ctx.tenantId,
    podeSimular: canActOnSector(ctx, setor),
    /** Custo de equipe e margem são confidenciais: só administrador do setor. */
    podeGerir: canManageSector(ctx, setor),
  };
}
