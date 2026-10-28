// A leitura do bloqueio dos Quadros por setor (28/10/2026) — ver
// `quadrosDosColaboradores.ts`. À parte da regra porque lê o banco.
//
// Nunca derruba a tela: sem a tabela (deploy antes da migration) ou com o banco
// recusando, vale o padrão, que é liberado.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector } from "@/lib/auth/papeis";
import { podeEditarQuadros } from "./quadrosDosColaboradores";

/** O coordenador bloqueou a criação e a edição pelos colaboradores neste setor? */
export async function quadrosBloqueados(tenantId: string, sectorCode: string): Promise<boolean> {
  if (!tenantId || !sectorCode) return false;
  try {
    const linha = await getPrisma().sectorQuadrosBloqueados.findUnique({
      where: { tenantId_sectorCode: { tenantId, sectorCode } },
      select: { id: true },
    });
    return linha !== null;
  } catch (err) {
    if (!isPrismaMissingTableError(err)) console.error("[quadrosBloqueados]", err);
    return false;
  }
}

/**
 * A regra com o bloqueio já lido: o coordenador não paga a consulta, e quem não
 * é do setor também não.
 */
export async function podeEditarQuadrosNoSetor(
  ctx: Pick<AuthContext, "tenantId" | "role" | "sectors" | "subscriptionReadOnly">,
  sectorCode: string,
): Promise<boolean> {
  if (canManageSector(ctx, sectorCode)) return true;
  if (!canActOnSector(ctx, sectorCode)) return false;
  return podeEditarQuadros(ctx, sectorCode, await quadrosBloqueados(ctx.tenantId, sectorCode));
}
