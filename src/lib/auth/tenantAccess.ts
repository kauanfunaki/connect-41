import { getPrisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";
import { escritoriosAcessiveis } from "@/lib/auth/trocaDeEscritorio";

// Tenants que um usuário pode visualizar além do próprio — só SUPER_ADMIN tem
// acesso a mais de um tenant (via UserTenantAccess); demais papéis ficam presos
// ao próprio tenantId, então retornam lista vazia (o próprio tenantId já é
// tratado separadamente pelo token/middleware). A regra mora em
// `escritoriosAcessiveis` (trocaDeEscritorio.ts), pura e testada; aqui só se
// busca a concessão — e só para quem pode usá-la.
export async function getAccessibleTenantIds(userId: string, role: UserRole, homeTenantId: string): Promise<string[]> {
  if (role !== "SUPER_ADMIN") return [];

  const prisma = getPrisma();
  const grants = await prisma.userTenantAccess.findMany({
    where: { userId },
    select: { tenantId: true },
  });

  return escritoriosAcessiveis(role, homeTenantId, grants.map((g) => g.tenantId));
}
