import { getPrisma } from "@/lib/prisma";
import { alcanceVazio, type AlcanceFiscal } from "@/lib/fiscal/alcance";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";

/**
 * Alcance do cliente logado: só as empresas do grupo dele.
 *
 * A contrapartida de `alcanceDaEquipe`, e o motivo de `AlcanceFiscal` existir
 * como tipo desde a etapa 3 — a camada de dados já recebia isto como primeiro
 * argumento antes de o portal existir. Aqui não se escreve `where` nenhum novo:
 * só se monta o alcance e se entrega.
 *
 * **Grupo vazio resolve para NADA**, nunca para tudo. Um cliente cujo grupo não
 * tem empresa nenhuma recebe `IN ()`, que não casa com linha alguma. É o caso
 * que uma cláusula montada por concatenação transformaria em acesso total.
 *
 * O `tenantId` entra na consulta além do grupo: o `clientGroupId` vem do token,
 * e token de outro tenant não pode alcançar empresa deste.
 */
export async function alcanceDoCliente(sessao: PortalAccessTokenPayload): Promise<AlcanceFiscal> {
  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId },
    select: { id: true },
  });

  if (empresas.length === 0) return alcanceVazio(sessao.tenantId);
  return { tipo: "EMPRESAS", tenantId: sessao.tenantId, companyIds: empresas.map((e) => e.id) };
}
