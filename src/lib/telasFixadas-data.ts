import { getPrisma } from "@/lib/prisma";

/**
 * Os códigos das telas que esta pessoa fixou neste workspace, na ordem dela.
 *
 * Fica fora de `telasFixadas.ts` porque aquele arquivo é regra pura, lida pelos
 * testes; aqui mora a única consulta. Sem usuário ou sem tenant (sessão a meio
 * caminho), devolve lista vazia em vez de erro — a sidebar continua montando.
 */
export async function codigosDeTelasFixadas(
  userId: string | null | undefined,
  tenantId: string | null | undefined
): Promise<string[]> {
  if (!userId || !tenantId) return [];
  const linhas = await getPrisma().userPinnedModule.findMany({
    where: { userId, tenantId },
    orderBy: { position: "asc" },
    select: { moduleCode: true },
  });
  return linhas.map((l) => l.moduleCode);
}
