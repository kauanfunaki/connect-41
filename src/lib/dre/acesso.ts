// Quem abre a DRE de caixa — e, pela mesma régua, quem baixa a exportação.
//
// Saiu de dentro de `app/(app)/dre/page.tsx` em 13/10/2026, quando a DRE ganhou
// a exportação no modelo do BPO: a rota do arquivo tem de deixar passar
// exatamente quem a tela deixa, e duas cópias da regra divergem na primeira
// mudança de uma delas.

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";

type Quem = Pick<AuthContext, "tenantId" | "role" | "sectors" | "subscriptionReadOnly">;

/**
 * O DRE nasce como entrega do BPO, mas o gate é o setor que opera o módulo
 * neste tenant — num cliente ele pode ser do Financeiro (ver `setorDoModulo`).
 * Módulo desligado no escritório, DRE fora — como a DRE econômica e as
 * análises (05/10/2026).
 */
export async function podeAbrirADre(ctx: Quem): Promise<boolean> {
  if (!ctx.tenantId) return false;
  const setores = (await setoresDoModulo(ctx.tenantId, "bpo_dre")) ?? ["bpo"];
  if (!canActOnSector(ctx, setores)) return false;
  return isModuleEnabled(ctx.tenantId, "bpo_dre");
}

/**
 * Quem troca o modelo do DRE de uma empresa (21/10/2026): a coordenação do
 * setor que opera a DRE. A troca refaz a classificação da empresa inteira —
 * é decisão de quem responde pelo relatório, como aprovar o orçamento.
 */
export async function podeTrocarOModeloDoDre(ctx: Quem): Promise<boolean> {
  if (!(await podeAbrirADre(ctx))) return false;
  const setores = (await setoresDoModulo(ctx.tenantId!, "bpo_dre")) ?? ["bpo"];
  return canManageSector(ctx, setores);
}
