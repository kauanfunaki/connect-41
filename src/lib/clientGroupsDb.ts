// Acesso a banco do agrupador de cliente. Fica separado de `clientGroups.ts`
// de propósito: aquele arquivo é regra pura e é testado sem subir Prisma, e
// misturar as duas coisas custaria essa propriedade.

import { getPrisma } from "@/lib/prisma";

/**
 * Clientes ativos do tenant, no formato do `<select>` do cadastro de empresa.
 *
 * Ordena por nome porque a lista é lida por gente — a ordem de criação não diz
 * nada a quem está procurando "Grupo Aurora" no meio de dezenas.
 */
export async function getActiveClientGroupOptions(
  tenantId: string
): Promise<{ value: string; label: string }[]> {
  const prisma = getPrisma();
  const grupos = await prisma.clientGroup.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return grupos.map((g) => ({ value: g.id, label: g.name }));
}
