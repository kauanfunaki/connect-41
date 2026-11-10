import { getPrisma } from "@/lib/prisma";

// A leitura do banco das regras do Repositório de senhas (10/11/2026, pedido
// do Kauan) — as regras em si moram em `regrasDasSenhas.ts`, sem Prisma, porque
// a tela de cliente importa de lá.

/**
 * Quem pode ser marcado em "todos do setor, menos…": as pessoas ativas do
 * setor, usuário ou coordenador. O Administrador e o Super Admin ficam de fora
 * (gerenciam tudo, a marca não valeria para eles), e o somente leitura não usa
 * o Repositório. A tela tira ainda quem cadastrou e quem está marcando; a
 * action confere de novo por `restricoesValidas`.
 */
export async function pessoasQuePodemSerMarcadas(tenantId: string, setor: string): Promise<{ id: string; name: string }[]> {
  return getPrisma().user.findMany({
    where: { tenantId, active: true, role: { in: ["SECTOR_USER", "SECTOR_ADMIN"] }, sectors: { some: { sectorCode: setor } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
