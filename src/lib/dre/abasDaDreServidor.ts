// Quais das quatro abas da DRE a pessoa abre — o mesmo gate de cada tela, para
// a fileira nunca mostrar uma aba que responde 404.

import { canViewSector, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { podeAbrirADre } from "@/lib/dre/acesso";
import { MODULO_DE_ORCAMENTO } from "@/lib/dre/orcamento/dados";
import type { AbaDaDre } from "@/lib/dre/abasDaDre";

const MODULO_DA_ABA: Record<Exclude<AbaDaDre, "caixa">, string> = {
  competencia: "dre_economica",
  analises: "dre_analises",
  orcamento: MODULO_DE_ORCAMENTO,
};

/** As telas de competência, análises e orçamento: setor que vê o módulo e módulo ligado. */
async function podeVerOModulo(ctx: AuthContext, modulo: string): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const setores = (await setoresDoModulo(ctx.tenantId, modulo)) ?? getModuleDef(modulo)?.sectorCode;
  if (!setores || !canViewSector(ctx, setores)) return false;
  return isModuleEnabled(ctx.tenantId, modulo);
}

export async function abasDaDreLiberadas(ctx: AuthContext): Promise<Set<AbaDaDre>> {
  const [caixa, ...outras] = await Promise.all([
    podeAbrirADre(ctx),
    ...(Object.entries(MODULO_DA_ABA) as [AbaDaDre, string][]).map(async ([aba, modulo]) =>
      (await podeVerOModulo(ctx, modulo)) ? aba : null
    ),
  ]);
  const liberadas = new Set<AbaDaDre>(outras.filter((a): a is AbaDaDre => a !== null));
  if (caixa) liberadas.add("caixa");
  return liberadas;
}
