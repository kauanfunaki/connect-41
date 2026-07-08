import { getPrisma } from "@/lib/prisma";

// Revoga todos os refresh tokens ativos de um usuário. Chamar quando a senha é
// trocada ou a conta é desativada — assim, combinado com o access token curto
// (15min) + refresh silencioso, a sessão do usuário morre em no máximo ~15min
// (o próximo refresh falha porque o token foi revogado / a conta está inativa).
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const prisma = getPrisma();
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
