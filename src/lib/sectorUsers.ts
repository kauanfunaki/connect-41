import { getPrisma } from "@/lib/prisma";

export type SectorUser = { id: string; name: string };

// Usuários que podem ser designados como responsáveis num item de um setor:
// membros do setor (via UserSector) + ADMIN/SUPER_ADMIN do tenant.
// Aceita os setores de uma tela (21/10/2026): quem é de qualquer um deles.
export async function getSectorUsers(tenantId: string, sectorCode: string | readonly string[]): Promise<SectorUser[]> {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: {
      tenantId,
      active: true,
      OR: [{ role: { in: ["SUPER_ADMIN", "ADMIN"] } }, { sectors: { some: { sectorCode: typeof sectorCode === "string" ? sectorCode : { in: [...sectorCode] } } } }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return users;
}
