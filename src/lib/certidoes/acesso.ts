// Quem vê e quem pede certidões (28/10/2026): o setor que opera o módulo —
// o Societário, se ninguém mudou. Ver vê quem vê o setor; pedir e marcar como
// vista, quem age nele.

import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canViewSector } from "@/lib/auth/papeis";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { MODULO_CERTIDOES } from "./servidor";

export type AcessoAsCertidoes = { ctx: AuthContext; tenantId: string; userId: string; podeEditar: boolean };

/** null = não vê (a página dá 404 e as actions recusam). */
export async function acessoAsCertidoes(ctx: AuthContext): Promise<AcessoAsCertidoes | null> {
  if (!ctx.tenantId || !ctx.userId) return null;
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_CERTIDOES))) return null;
  const setores = (await setoresDoModulo(ctx.tenantId, MODULO_CERTIDOES)) ?? "societario";
  if (!canViewSector(ctx, setores)) return null;
  return { ctx, tenantId: ctx.tenantId, userId: ctx.userId, podeEditar: canActOnSector(ctx, setores) };
}
