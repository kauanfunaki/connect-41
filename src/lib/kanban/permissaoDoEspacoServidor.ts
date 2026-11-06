// A leitura da permissão do espaço (05/11/2026) — ver `permissaoDoEspaco.ts`.
// À parte da regra porque lê o banco.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { canActOnSector, canManageSector } from "@/lib/auth/papeis";
import { poderesNoEspaco, type PoderesNoEspaco } from "./permissaoDoEspaco";

type Quem = Pick<AuthContext, "role" | "sectors" | "subscriptionReadOnly">;

/**
 * Os poderes de quem pede numa lista (ou num espaço, pelo id). O coordenador, o
 * administrador e quem só vê não dependem da permissão do espaço, então não
 * pagam a consulta.
 */
export async function poderesNaLista(ctx: Quem, lista: { sectorCode: string; spaceId: string }): Promise<PoderesNoEspaco> {
  if (canManageSector(ctx, lista.sectorCode) || !canActOnSector(ctx, lista.sectorCode)) {
    return poderesNoEspaco(ctx, { sectorCode: lista.sectorCode, defaultPermission: "EXIBIR" });
  }
  const espaco = await getPrisma().space.findUnique({ where: { id: lista.spaceId }, select: { defaultPermission: true } });
  // Espaço sumido: o mínimo, que é ver.
  return poderesNoEspaco(ctx, { sectorCode: lista.sectorCode, defaultPermission: espaco?.defaultPermission ?? "EXIBIR" });
}
