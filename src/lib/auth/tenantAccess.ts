import { getPrisma } from "@/lib/prisma";
import type { UserRole } from "@/generated/prisma/enums";

// Tenants que um usuário pode visualizar além do próprio — só SUPER_ADMIN tem
// acesso a mais de um tenant (via UserTenantAccess); demais papéis ficam presos
// ao próprio tenantId, então retornam lista vazia (o próprio tenantId já é
// tratado separadamente pelo token/middleware).
export async function getAccessibleTenantIds(userId: string, role: UserRole, homeTenantId: string): Promise<string[]> {
  if (role !== "SUPER_ADMIN") return [];

  const prisma = getPrisma();
  const grants = await prisma.userTenantAccess.findMany({
    where: { userId },
    select: { tenantId: true },
  });

  return [...new Set([homeTenantId, ...grants.map((g) => g.tenantId)])];
}
