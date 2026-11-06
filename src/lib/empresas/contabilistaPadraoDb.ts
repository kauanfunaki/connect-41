// O contabilista padrão do escritório (06/11/2026), lido do banco. Separado de
// `camposSped.ts` para a regra continuar pura e testável sem Prisma.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { Contabilista } from "./camposSped";

const VAZIO: Contabilista = { contabilistaNome: null, contabilistaCpf: null, contabilistaCrc: null };

/**
 * O padrão do escritório, ou tudo nulo se ele não configurou. Se a migration
 * de 06/11/2026 ainda não rodou (P2021), cai no vazio em vez de derrubar a tela.
 */
export async function lerContabilistaPadrao(tenantId: string): Promise<Contabilista> {
  try {
    const linha = await getPrisma().tenantSpedConfig.findUnique({
      where: { tenantId },
      select: { contabilistaNome: true, contabilistaCpf: true, contabilistaCrc: true },
    });
    return linha ?? VAZIO;
  } catch (err) {
    if (isPrismaMissingTableError(err)) return VAZIO;
    throw err;
  }
}
